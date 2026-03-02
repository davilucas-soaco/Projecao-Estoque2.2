import type { Order, ProductConsolidated, ShelfFicha, StockItem } from './types';
import type { DateColumn } from './types';
import {
  getCategoriaFromObservacoes,
  CATEGORY_REQUISICAO,
  CATEGORY_INSERIR_ROMANEIO,
  dateToKey,
  formatDestinoForTooltip,
  parseOrderDate,
} from './utils';

interface ConsolidationFilterOptions {
  considerarRequisicoes?: boolean;
  /** Quando true, produtos acabados (shelf) não são exibidos; apenas componentes (ex.: PA 6895 → PI 0761, MP 2788) */
  flattenShelfProducts?: boolean;
}

const parseOrderDateAtStartOfDay = (dateStr: string): Date | null => {
  const d = parseOrderDate(dateStr);
  if (!d) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

const isOrderEligibleBase = (order: Order, options?: ConsolidationFilterOptions): boolean => {
  const considerarRequisicoes = options?.considerarRequisicoes ?? true;
  const categoria = getCategoriaFromObservacoes(order.observacoesRomaneio);
  const dEntrega = parseOrderDateAtStartOfDay(order.dataEntrega);

  if (categoria === CATEGORY_INSERIR_ROMANEIO) return false;
  if (!considerarRequisicoes && categoria === CATEGORY_REQUISICAO) return false;
  if (!dEntrega) return false;
  return true;
};

const isOrderEligibleForProjection = (
  order: Order,
  lastFutureDate: Date | null | undefined,
  options?: ConsolidationFilterOptions
): boolean => {
  if (!isOrderEligibleBase(order, options)) return false;
  const dEntrega = parseOrderDateAtStartOfDay(order.dataEntrega);
  if (!dEntrega) return false;
  if (lastFutureDate && dEntrega > lastFutureDate) return false;
  return true;
};

export function countEligibleProjectionRows(
  orders: Order[],
  dateColumns: DateColumn[],
  options?: ConsolidationFilterOptions
): number {
  void dateColumns;
  return orders.reduce((acc, order) => {
    if (isOrderEligibleBase(order, options)) {
      return acc + 1;
    }
    return acc;
  }, 0);
}

/** Retorna a quantidade de pedidos únicos elegíveis para projeção (para indicador do rodapé) */
export function getEligibleUniqueOrderCount(
  orders: Order[],
  dateColumns: DateColumn[],
  options?: ConsolidationFilterOptions
): number {
  void dateColumns;
  const seen = new Set<string>();
  orders.forEach((order) => {
    if (isOrderEligibleBase(order, options)) {
      seen.add(order.numeroPedido);
    }
  });
  return seen.size;
}

export function buildConsolidatedData(
  orders: Order[],
  stock: StockItem[],
  shelfFicha: ShelfFicha[],
  searchTerm: string,
  dateColumns: DateColumn[],
  todayStart: Date,
  options?: ConsolidationFilterOptions
): ProductConsolidated[] {
  const considerarRequisicoes = options?.considerarRequisicoes ?? true;
  const flattenShelfProducts = options?.flattenShelfProducts ?? false;

  const productMap = new Map<string, ProductConsolidated>();
  const shelfFichaMap = new Map<string, ShelfFicha>();
  const componentCodesSet = new Set<string>();
  shelfFicha.forEach((f) => {
    if (f.codigoEstante) {
      shelfFichaMap.set(f.codigoEstante.trim().toUpperCase(), f);
      componentCodesSet.add((f.codColuna || '').trim().toUpperCase());
      componentCodesSet.add((f.codBandeja || '').trim().toUpperCase());
    }
  });

  const horizonDate = dateColumns[dateColumns.length - 1]?.date;
  const dateKeysSet = new Set(dateColumns.filter((c) => !c.isAtrasados).map((c) => c.key));

  const parseOrderDateLocal = (dateStr: string) => {
    const d = parseOrderDate(dateStr);
    if (d) {
      d.setHours(0, 0, 0, 0);
      return d;
    }
    return null;
  };

  /** Produto simples (sem hierarquia) - usado quando flattenShelfProducts ou para componentes */
  const ensureSimpleProduct = (codigo: string, descricao: string): ProductConsolidated => {
    if (!productMap.has(codigo)) {
      productMap.set(codigo, {
        codigo,
        descricao,
        estoqueAtual: 0,
        totalPedido: 0,
        pendenteProducao: 0,
        routeData: {},
      });
    }
    return productMap.get(codigo)!;
  };

  const ensureProduct = (codigo: string, descricao: string): ProductConsolidated => {
    if (flattenShelfProducts) {
      return ensureSimpleProduct(codigo, descricao);
    }
    if (!productMap.has(codigo)) {
      const normalizedCode = codigo.trim().toUpperCase();
      const ficha = shelfFichaMap.get(normalizedCode);
      productMap.set(codigo, {
        codigo,
        descricao,
        estoqueAtual: 0,
        totalPedido: 0,
        pendenteProducao: 0,
        routeData: {},
        isShelf: !!ficha,
        components: ficha
          ? [
              { codigo: ficha.codColuna, descricao: ficha.descColuna, estoqueAtual: 0, totalPedido: 0, falta: 0, routeData: {} },
              { codigo: ficha.codBandeja, descricao: ficha.descBandeja, estoqueAtual: 0, totalPedido: 0, falta: 0, routeData: {} },
            ]
          : undefined,
      });
    }
    return productMap.get(codigo)!;
  };

  const addToDateColumn = (
    obj: { routeData: Record<string, { pedido: number; falta: number; breakdown?: { destino: string; qty: number; numeroPedido?: string }[] }> },
    colKey: string,
    qty: number,
    destinoDisplay: string,
    numeroPedido?: string
  ) => {
    if (!obj.routeData[colKey]) obj.routeData[colKey] = { pedido: 0, falta: 0, breakdown: [] };
    obj.routeData[colKey].pedido += qty;
    const ped = numeroPedido ?? '';
    const existing = obj.routeData[colKey].breakdown!.find(
      (b) => b.destino === destinoDisplay && (b.numeroPedido ?? '') === ped
    );
    if (existing) existing.qty += qty;
    else obj.routeData[colKey].breakdown!.push({ destino: destinoDisplay, qty, ...(numeroPedido ? { numeroPedido } : {}) });
  };

  const lastFutureDate = dateColumns[dateColumns.length - 1]?.date;

  orders.forEach((order) => {
    if (!isOrderEligibleForProjection(order, lastFutureDate, options)) return;

    const categoria = getCategoriaFromObservacoes(order.observacoesRomaneio);
    const dEntrega = parseOrderDateLocal(order.dataEntrega);
    if (!dEntrega) return;
    const orderQty = order.qtdVinculada || order.qtdPedida;
    const destDisplay = formatDestinoForTooltip(categoria || order.observacoesRomaneio);
    const normalizedCodigo = order.codigoProduto.trim().toUpperCase();
    const ficha = shelfFichaMap.get(normalizedCodigo);
    const isComponentOfAnother = componentCodesSet.has(normalizedCodigo);

    if (flattenShelfProducts && ficha && !isComponentOfAnother) {
      const col = ensureSimpleProduct(ficha.codColuna, ficha.descColuna);
      const ban = ensureSimpleProduct(ficha.codBandeja, ficha.descBandeja);
      const qtyCol = orderQty * ficha.qtdColuna;
      const qtyBan = orderQty * ficha.qtdBandeja;
      col.totalPedido += qtyCol;
      ban.totalPedido += qtyBan;
      if (considerarRequisicoes && categoria === CATEGORY_REQUISICAO && (!horizonDate || dEntrega <= horizonDate)) {
        const routeName = CATEGORY_REQUISICAO;
        if (!col.routeData[routeName]) col.routeData[routeName] = { pedido: 0, falta: 0, breakdown: [] };
        col.routeData[routeName].pedido += qtyCol;
        const colEx = col.routeData[routeName].breakdown!.find((b) => b.destino === 'Requisição' && (b.numeroPedido ?? '') === (order.numeroPedido ?? ''));
        if (colEx) colEx.qty += qtyCol;
        else col.routeData[routeName].breakdown!.push({ destino: 'Requisição', qty: qtyCol, numeroPedido: order.numeroPedido });
        if (!ban.routeData[routeName]) ban.routeData[routeName] = { pedido: 0, falta: 0, breakdown: [] };
        ban.routeData[routeName].pedido += qtyBan;
        const banEx = ban.routeData[routeName].breakdown!.find((b) => b.destino === 'Requisição' && (b.numeroPedido ?? '') === (order.numeroPedido ?? ''));
        if (banEx) banEx.qty += qtyBan;
        else ban.routeData[routeName].breakdown!.push({ destino: 'Requisição', qty: qtyBan, numeroPedido: order.numeroPedido });
      }
      if (dEntrega <= todayStart && categoria !== CATEGORY_REQUISICAO) {
        addToDateColumn(col, 'ATRASADOS', qtyCol, destDisplay, order.numeroPedido);
        addToDateColumn(ban, 'ATRASADOS', qtyBan, destDisplay, order.numeroPedido);
      } else if (dEntrega > todayStart) {
        const key = dateToKey(dEntrega);
        if (dateKeysSet.has(key)) {
          addToDateColumn(col, key, qtyCol, destDisplay, order.numeroPedido);
          addToDateColumn(ban, key, qtyBan, destDisplay, order.numeroPedido);
        }
      }
      return;
    }

    const prod = ensureProduct(order.codigoProduto, order.descricao);
    prod.totalPedido += orderQty;
    if (!flattenShelfProducts && prod.isShelf && prod.components) {
      const fic = shelfFichaMap.get(prod.codigo.trim().toUpperCase())!;
      prod.components[0].totalPedido += orderQty * fic.qtdColuna;
      prod.components[1].totalPedido += orderQty * fic.qtdBandeja;
    }

    if (considerarRequisicoes && categoria === CATEGORY_REQUISICAO && (!horizonDate || dEntrega <= horizonDate)) {
      const routeName = CATEGORY_REQUISICAO;
      if (!prod.routeData[routeName]) prod.routeData[routeName] = { pedido: 0, falta: 0, breakdown: [] };
      prod.routeData[routeName].pedido += orderQty;
      const existing = prod.routeData[routeName].breakdown!.find((b) => b.destino === 'Requisição' && (b.numeroPedido ?? '') === (order.numeroPedido ?? ''));
      if (existing) existing.qty += orderQty;
      else prod.routeData[routeName].breakdown!.push({ destino: 'Requisição', qty: orderQty, numeroPedido: order.numeroPedido });

      if (!flattenShelfProducts && prod.isShelf && prod.components) {
        const fic = shelfFichaMap.get(prod.codigo.trim().toUpperCase())!;
        const col = prod.components[0];
        if (!col.routeData[routeName]) col.routeData[routeName] = { pedido: 0, falta: 0, breakdown: [] };
        col.routeData[routeName].pedido += orderQty * fic.qtdColuna;
        const colExisting = col.routeData[routeName].breakdown!.find((b) => b.destino === 'Requisição' && (b.numeroPedido ?? '') === (order.numeroPedido ?? ''));
        if (colExisting) colExisting.qty += orderQty * fic.qtdColuna;
        else col.routeData[routeName].breakdown!.push({ destino: 'Requisição', qty: orderQty * fic.qtdColuna, numeroPedido: order.numeroPedido });
        const ban = prod.components[1];
        if (!ban.routeData[routeName]) ban.routeData[routeName] = { pedido: 0, falta: 0, breakdown: [] };
        ban.routeData[routeName].pedido += orderQty * fic.qtdBandeja;
        const banExisting = ban.routeData[routeName].breakdown!.find((b) => b.destino === 'Requisição' && (b.numeroPedido ?? '') === (order.numeroPedido ?? ''));
        if (banExisting) banExisting.qty += orderQty * fic.qtdBandeja;
        else ban.routeData[routeName].breakdown!.push({ destino: 'Requisição', qty: orderQty * fic.qtdBandeja, numeroPedido: order.numeroPedido });
      }
    }

    if (dEntrega <= todayStart && categoria !== CATEGORY_REQUISICAO) {
      addToDateColumn(prod, 'ATRASADOS', orderQty, destDisplay, order.numeroPedido);
      if (!flattenShelfProducts && prod.isShelf && prod.components) {
        const fic = shelfFichaMap.get(prod.codigo.trim().toUpperCase())!;
        addToDateColumn(prod.components[0], 'ATRASADOS', orderQty * fic.qtdColuna, destDisplay, order.numeroPedido);
        addToDateColumn(prod.components[1], 'ATRASADOS', orderQty * fic.qtdBandeja, destDisplay, order.numeroPedido);
      }
    } else if (dEntrega > todayStart) {
      const key = dateToKey(dEntrega);
      if (dateKeysSet.has(key)) {
        addToDateColumn(prod, key, orderQty, destDisplay, order.numeroPedido);
        if (!flattenShelfProducts && prod.isShelf && prod.components) {
          const fic = shelfFichaMap.get(prod.codigo.trim().toUpperCase())!;
          addToDateColumn(prod.components[0], key, orderQty * fic.qtdColuna, destDisplay, order.numeroPedido);
          addToDateColumn(prod.components[1], key, orderQty * fic.qtdBandeja, destDisplay, order.numeroPedido);
        }
      }
    }
  });

  const stockMap = new Map<string, number>();
  stock.forEach((s) => stockMap.set(s.codigo, s.saldoSetorFinal));

  productMap.forEach((prod) => {
    if (!prod.isShelf) {
      prod.estoqueAtual = stockMap.get(prod.codigo) || 0;
    } else if (prod.components) {
      prod.components.forEach((comp) => {
        comp.estoqueAtual = stockMap.get(comp.codigo) || 0;
      });
    }
  });

  const consumptionOrder = considerarRequisicoes
    ? [CATEGORY_REQUISICAO, 'ATRASADOS', ...dateColumns.filter((c) => !c.isAtrasados).map((c) => c.key)]
    : ['ATRASADOS', ...dateColumns.filter((c) => !c.isAtrasados).map((c) => c.key)];

  productMap.forEach((prod) => {
    if (!prod.isShelf) {
      let runningBalance = Math.max(0, prod.estoqueAtual);
      let totalFalta = 0;

      for (const colKey of consumptionOrder) {
        const rd = prod.routeData[colKey];
        if (!rd) continue;
        const needed = rd.pedido;
        if (runningBalance >= needed) {
          rd.falta = 0;
          runningBalance -= needed;
        } else {
          const missing = needed - runningBalance;
          rd.falta = -missing;
          totalFalta += rd.falta;
          runningBalance = 0;
        }
      }
      prod.pendenteProducao = totalFalta;
    } else if (prod.components) {
      let shelfTotalFalta = Infinity;

      prod.components.forEach((comp) => {
        let runningBalance = Math.max(0, comp.estoqueAtual);
        let compTotalFalta = 0;

        for (const colKey of consumptionOrder) {
          const rd = comp.routeData[colKey];
          if (!rd) continue;
          const needed = rd.pedido;
          if (runningBalance >= needed) {
            rd.falta = 0;
            runningBalance -= needed;
          } else {
            const missing = needed - runningBalance;
            rd.falta = -missing;
            compTotalFalta += rd.falta;
            runningBalance = 0;
          }
          if (!prod.routeData[colKey]) prod.routeData[colKey] = { pedido: 0, falta: 0 };
          prod.routeData[colKey].falta = Math.min(prod.routeData[colKey].falta ?? 0, rd.falta);
        }

        comp.falta = compTotalFalta;
        shelfTotalFalta = Math.min(shelfTotalFalta, compTotalFalta);
      });

      prod.pendenteProducao = shelfTotalFalta;
    }
  });

  let result = Array.from(productMap.values());
  if (searchTerm) {
    const lowerSearch = searchTerm.toLowerCase();
    result = result.filter(
      (p) => p.codigo.toLowerCase().includes(lowerSearch) || p.descricao.toLowerCase().includes(lowerSearch)
    );
  }
  return result;
}
