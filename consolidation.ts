import type { Order, ProductConsolidated, ShelfFicha, StockItem } from './types';
import type { DateColumn } from './types';
import {
  getHorizonInfo,
  getCategoriaFromObservacoes,
  CATEGORY_REQUISICAO,
  CATEGORY_INSERIR_ROMANEIO,
  dateToKey,
  formatDestinoForTooltip,
  parseOrderDate,
} from './utils';

interface ConsolidationFilterOptions {
  considerarRequisicoes?: boolean;
}

const isOrderEligibleForProjection = (
  order: Order,
  lastFutureDate: Date | null | undefined,
  options?: ConsolidationFilterOptions
): boolean => {
  const considerarRequisicoes = options?.considerarRequisicoes ?? true;
  const categoria = getCategoriaFromObservacoes(order.observacoesRomaneio);
  const dEntrega = parseOrderDate(order.dataEntrega);
  if (dEntrega) dEntrega.setHours(0, 0, 0, 0);

  if (categoria === CATEGORY_INSERIR_ROMANEIO) return false;
  if (!considerarRequisicoes && categoria === CATEGORY_REQUISICAO) return false;
  if (!dEntrega) return false;
  if (lastFutureDate && dEntrega > lastFutureDate) return false;
  return true;
};

export function countEligibleProjectionRows(
  orders: Order[],
  dateColumns: DateColumn[],
  options?: ConsolidationFilterOptions
): number {
  const lastFutureDate = dateColumns[dateColumns.length - 1]?.date;
  return orders.reduce((acc, order) => {
    if (isOrderEligibleForProjection(order, lastFutureDate, options)) {
      return acc + 1;
    }
    return acc;
  }, 0);
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

  const productMap = new Map<string, ProductConsolidated>();
  const shelfFichaMap = new Map<string, ShelfFicha>();
  shelfFicha.forEach((f) => {
    if (f.codigoEstante) {
      shelfFichaMap.set(f.codigoEstante.trim().toUpperCase(), f);
    }
  });

  const horizon = getHorizonInfo();
  const horizonDate = horizon.end;
  const dateKeysSet = new Set(dateColumns.filter((c) => !c.isAtrasados).map((c) => c.key));

  const parseOrderDateLocal = (dateStr: string) => {
    const d = parseOrderDate(dateStr);
    if (d) {
      d.setHours(0, 0, 0, 0);
      return d;
    }
    return null;
  };

  const ensureProduct = (codigo: string, descricao: string) => {
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
    obj: { routeData: Record<string, { pedido: number; falta: number; breakdown?: { destino: string; qty: number }[] }> },
    colKey: string,
    qty: number,
    destinoDisplay: string
  ) => {
    if (!obj.routeData[colKey]) obj.routeData[colKey] = { pedido: 0, falta: 0, breakdown: [] };
    obj.routeData[colKey].pedido += qty;
    const existing = obj.routeData[colKey].breakdown!.find((b) => b.destino === destinoDisplay);
    if (existing) existing.qty += qty;
    else obj.routeData[colKey].breakdown!.push({ destino: destinoDisplay, qty });
  };

  const lastFutureDate = dateColumns[dateColumns.length - 1]?.date;

  orders.forEach((order) => {
    if (!isOrderEligibleForProjection(order, lastFutureDate, options)) return;

    const categoria = getCategoriaFromObservacoes(order.observacoesRomaneio);
    const dEntrega = parseOrderDateLocal(order.dataEntrega);
    if (!dEntrega) return;
    const orderQty = order.qtdVinculada || order.qtdPedida;
    const destDisplay = formatDestinoForTooltip(categoria || order.observacoesRomaneio);

    const prod = ensureProduct(order.codigoProduto, order.descricao);
    prod.totalPedido += orderQty;
    if (prod.isShelf && prod.components) {
      const normalizedCode = prod.codigo.trim().toUpperCase();
      const ficha = shelfFichaMap.get(normalizedCode)!;
      prod.components[0].totalPedido += orderQty * ficha.qtdColuna;
      prod.components[1].totalPedido += orderQty * ficha.qtdBandeja;
    }

    if (considerarRequisicoes && categoria === CATEGORY_REQUISICAO && dEntrega && dEntrega <= horizonDate) {
      const routeName = CATEGORY_REQUISICAO;
      if (!prod.routeData[routeName]) prod.routeData[routeName] = { pedido: 0, falta: 0, breakdown: [] };
      prod.routeData[routeName].pedido += orderQty;
      const existing = prod.routeData[routeName].breakdown!.find((b) => b.destino === 'Requisição');
      if (existing) existing.qty += orderQty;
      else prod.routeData[routeName].breakdown!.push({ destino: 'Requisição', qty: orderQty });

      if (prod.isShelf && prod.components) {
        const normalizedCode = prod.codigo.trim().toUpperCase();
        const ficha = shelfFichaMap.get(normalizedCode)!;
        const col = prod.components[0];
        if (!col.routeData[routeName]) col.routeData[routeName] = { pedido: 0, falta: 0, breakdown: [] };
        col.routeData[routeName].pedido += orderQty * ficha.qtdColuna;
        const colExisting = col.routeData[routeName].breakdown!.find((b) => b.destino === 'Requisição');
        if (colExisting) colExisting.qty += orderQty * ficha.qtdColuna;
        else col.routeData[routeName].breakdown!.push({ destino: 'Requisição', qty: orderQty * ficha.qtdColuna });
        const ban = prod.components[1];
        if (!ban.routeData[routeName]) ban.routeData[routeName] = { pedido: 0, falta: 0, breakdown: [] };
        ban.routeData[routeName].pedido += orderQty * ficha.qtdBandeja;
        const banExisting = ban.routeData[routeName].breakdown!.find((b) => b.destino === 'Requisição');
        if (banExisting) banExisting.qty += orderQty * ficha.qtdBandeja;
        else ban.routeData[routeName].breakdown!.push({ destino: 'Requisição', qty: orderQty * ficha.qtdBandeja });
      }
    }

    if (dEntrega <= todayStart && categoria !== CATEGORY_REQUISICAO) {
      addToDateColumn(prod, 'ATRASADOS', orderQty, destDisplay);
      if (prod.isShelf && prod.components) {
        const normalizedCode = prod.codigo.trim().toUpperCase();
        const ficha = shelfFichaMap.get(normalizedCode)!;
        addToDateColumn(prod.components[0], 'ATRASADOS', orderQty * ficha.qtdColuna, destDisplay);
        addToDateColumn(prod.components[1], 'ATRASADOS', orderQty * ficha.qtdBandeja, destDisplay);
      }
    } else if (dEntrega > todayStart) {
      const key = dateToKey(dEntrega);
      if (dateKeysSet.has(key)) {
        addToDateColumn(prod, key, orderQty, destDisplay);
        if (prod.isShelf && prod.components) {
          const normalizedCode = prod.codigo.trim().toUpperCase();
          const ficha = shelfFichaMap.get(normalizedCode)!;
          addToDateColumn(prod.components[0], key, orderQty * ficha.qtdColuna, destDisplay);
          addToDateColumn(prod.components[1], key, orderQty * ficha.qtdBandeja, destDisplay);
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
