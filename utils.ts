
export const ROUTE_G_TERESINA = 'Entrega em Grande Teresina';
export const ROUTE_SO_MOVEIS = 'Requisição';
export const ROUTE_CLIENTE_BUSCA = 'Retirada';

export const normalizeText = (str: string | undefined | null): string => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .toUpperCase()
    .trim();
};

export const CATEGORY_REQUISICAO = ROUTE_SO_MOVEIS;
export const CATEGORY_INSERIR_ROMANEIO = 'inserir em Romaneio';
export const CATEGORY_ENTREGA_GT = ROUTE_G_TERESINA;
export const CATEGORY_RETIRADA = ROUTE_CLIENTE_BUSCA;

export const getCategoriaFromObservacoes = (observacoes: string | undefined | null): string => {
  const original = (observacoes ?? '').toString().trim();
  if (!original) return '';

  // Remove prefixos numéricos do tipo "5-XXXX"
  const prefixMatch = original.match(/^\d+\s*[-–]\s*(.*)$/);
  const base = prefixMatch ? prefixMatch[1] : original;

  const norm = normalizeText(base).replace(/[^A-Z0-9]/g, '');
  if (!norm) return '';

  if (norm === 'REQUISICAO') return CATEGORY_REQUISICAO;

  if (norm === 'INSERIREMROMANEIO' || norm === 'INSERIRNORMANEIO') {
    return CATEGORY_INSERIR_ROMANEIO;
  }

  if (norm === 'ENTREGAEMGRANDETERESINA') {
    return CATEGORY_ENTREGA_GT;
  }

  if (norm.includes('RETIRADA') || norm === 'RETIRAR') {
    return CATEGORY_RETIRADA;
  }

  return base;
};

export const isCategoriaEspecial = (categoria: string | null | undefined): boolean => {
  const c = (categoria ?? '').trim();
  return (
    c === CATEGORY_REQUISICAO ||
    c === CATEGORY_INSERIR_ROMANEIO ||
    c === CATEGORY_ENTREGA_GT ||
    c === CATEGORY_RETIRADA
  );
};

export const parseOrderDate = (dateStr: string) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  return null;
};

/**
 * Valida se algum RM possui múltiplas datas de "Previsão atual" diferentes.
 * Retorna mensagem de erro com RM e idChave(s) afetados, ou null se válido.
 */
export function validateRmPrevisaoUnica(
  rows: { rm?: string; previsaoAtual?: string; idChave?: string }[]
): string | null {
  const byRm = new Map<string, Map<number, string[]>>();
  for (const r of rows) {
    const rm = (r.rm ?? '').toString().trim();
    if (!rm) continue;
    const raw = (r.previsaoAtual ?? '').toString().trim();
    const d = parseOrderDate(raw);
    const ts = d ? (d.setHours(0, 0, 0, 0), d.getTime()) : -1;
    if (!byRm.has(rm)) byRm.set(rm, new Map());
    const dateMap = byRm.get(rm)!;
    if (!dateMap.has(ts)) dateMap.set(ts, []);
    dateMap.get(ts)!.push(r.idChave ?? '');
  }
  for (const [rm, dateMap] of byRm) {
    if (dateMap.size > 1) {
      const idChaves = Array.from(dateMap.values()).flat().filter(Boolean);
      const idChavesStr = idChaves.length > 0 ? idChaves.join(', ') : '(sem idChave)';
      return `RM "${rm}" possui datas de Previsão atual diferentes. idChave(s) afetado(s): ${idChavesStr}. Corrija o arquivo antes de importar.`;
    }
  }
  return null;
}

/** Dias adiante para o horizonte da coluna Só Móveis (igual ao PDF) */
export const SO_MOVEIS_HORIZON_DAYS = 13;

export const getHorizonInfo = (daysAhead: number = 60) => {
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + Math.max(1, daysAhead) - 1);
  const formatDate = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return {
    start,
    end,
    label: `Horizonte: ${formatDate(start)} até ${formatDate(end)}`
  };
};

/** Horizonte da coluna Só Móveis: retroativo + dia atual até 13 dias em diante (igual ao PDF). */
export const getSoMoveisHorizonInfo = () => {
  const today = getTodayStart();
  const end = new Date(today);
  end.setDate(today.getDate() + SO_MOVEIS_HORIZON_DAYS);
  const formatShort = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return {
    start: today,
    end,
    label: `${formatShort(today)} a ${formatShort(end)}`,
    /** Data limite para incluir pedidos de Requisição (<= end) */
    endDate: end,
  };
};

/** Retorna a data de hoje zerada (meia-noite) */
export const getTodayStart = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Gera colunas de data para projeção: Atrasados + hoje + N dias futuros */
export const getDateColumns = (daysAhead: number = 60): { key: string; label: string; date: Date | null; isAtrasados: boolean }[] => {
  const today = getTodayStart();
  const cols: { key: string; label: string; date: Date | null; isAtrasados: boolean }[] = [
    { key: 'ATRASADOS', label: 'Atrasados', date: null, isAtrasados: true }
  ];
  const safeDaysAhead = Math.max(1, daysAhead);
  for (let i = 0; i <= safeDaysAhead; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    cols.push({
      key,
      label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
      date: d,
      isAtrasados: false
    });
  }
  return cols;
};

/** Estende as colunas de data para incluir datas presentes nos pedidos da projeção.
 * Garante que pedidos com previsão além dos 60 dias apareçam na tabela ao filtrar por rota. */
export const getExtendedDateColumns = (
  daysAhead: number,
  orders: { dataEntrega: string }[]
): { key: string; label: string; date: Date | null; isAtrasados: boolean }[] => {
  const base = getDateColumns(daysAhead);
  const keysSet = new Set(base.filter((c) => c.key !== 'ATRASADOS').map((c) => c.key));
  const today = getTodayStart();
  today.setHours(0, 0, 0, 0);

  for (const ord of orders) {
    const d = parseOrderDate(ord.dataEntrega);
    if (!d) continue;
    d.setHours(0, 0, 0, 0);
    if (d < today) continue;
    const key = d.toISOString().slice(0, 10);
    if (!keysSet.has(key)) {
      keysSet.add(key);
    }
  }

  const atrasados = base.find((c) => c.isAtrasados);
  const futureKeys = Array.from(keysSet).sort();
  const futureCols = futureKeys.map((key) => {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return {
      key,
      label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
      date,
      isAtrasados: false as const,
    };
  });

  return [...(atrasados ? [atrasados] : []), ...futureCols];
};

/** Normaliza data para chave YYYY-MM-DD */
export const dateToKey = (d: Date): string => d.toISOString().slice(0, 10);

/** Formata destino para exibição no tooltip */
export const formatDestinoForTooltip = (categoria: string): string => {
  if (!categoria || categoria === '&nbsp;') return 'Sem vínculo';
  if (categoria === CATEGORY_ENTREGA_GT) return 'Entrega em Grande Teresina';
  if (categoria === CATEGORY_RETIRADA) return 'Retirar';
  if (categoria === CATEGORY_REQUISICAO) return 'Requisição';
  if (categoria === CATEGORY_INSERIR_ROMANEIO) return 'Inserir em Romaneio';
  return categoria;
};

/** Chaves de categorias para relatório de supervisão */
export const SUPERVISAO_SO_MOVEIS = 'Requisição';
export const SUPERVISAO_ENTREGA_GT = 'Entrega em Grande Teresina';
export const SUPERVISAO_RETIRADA = 'Retirar';
const SUPERVISAO_DESTINOS_ESPECIAIS = new Set<string>([
  SUPERVISAO_SO_MOVEIS,
  SUPERVISAO_ENTREGA_GT,
  SUPERVISAO_RETIRADA,
]);

export interface RotaSupervisao {
  key: string;
  label: string;
  routeName: string;
  /** Data de previsão para ordenação (mais recentes primeiro) */
  previsaoDate: Date | null;
}

/** Extrai rotas dinâmicas da projeção: linhas com Observacoes começando por "ROTA" e RM preenchido.
 * Ordenação: Previsão atual, mais antigas primeiro (atrasadas primeiro, depois futuras em ordem crescente). */
export function extractRotasFromProjection(
  projection: { observacoes?: string; rm?: string; previsaoAtual?: string }[]
): RotaSupervisao[] {
  const seen = new Map<string, RotaSupervisao>();
  for (const row of projection) {
    const obs = (row.observacoes ?? '').toString().trim();
    const rm = (row.rm ?? '').toString().trim();
    if (!rm) continue;
    const prefixMatch = obs.match(/^\d+\s*[-–]\s*(.*)$/);
    const base = prefixMatch ? prefixMatch[1] : obs;
    if (!base.toUpperCase().startsWith('ROTA')) continue;
    const previsao = (row.previsaoAtual ?? '').toString().trim();
    let dataFormatada = '';
    let previsaoDate: Date | null = null;
    if (previsao) {
      const d = parseOrderDate(previsao);
      if (d) {
        previsaoDate = d;
        dataFormatada = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      }
    }
    const label = dataFormatada ? `${base} - ${dataFormatada}` : base;
    const key = `rota|${base}`;
    if (!seen.has(key)) seen.set(key, { key, label, routeName: base, previsaoDate });
  }
  return Array.from(seen.values()).sort((a, b) => {
    const da = a.previsaoDate?.getTime() ?? 0;
    const db = b.previsaoDate?.getTime() ?? 0;
    return da - db;
  });
}

/** Converte categoriaKey (do filtro) para o destino usado no breakdown */
function getDestinoFromCategoriaKey(categoriaKey: string): string {
  if (categoriaKey.startsWith('rota|')) return categoriaKey.slice(5);
  return categoriaKey;
}

function getRequisicaoRouteData(item: {
  routeData: Record<string, { pedido: number; falta: number; breakdown?: { destino: string; qty: number }[] }>;
}) {
  return (
    item.routeData['Requisição'] ??
    item.routeData['Requisicao'] ??
    item.routeData['Só Móveis'] ??
    item.routeData['So Moveis'] ??
    item.routeData['SÓ MÓVEIS'] ??
    item.routeData['SO MOVEIS']
  );
}

/** Verifica se um destino do breakdown corresponde ao destino da supervisão (aceita variantes) */
function destinoMatches(destinoBreakdown: string, destinoSupervisao: string): boolean {
  if (destinoBreakdown === destinoSupervisao) return true;
  const b = (destinoBreakdown ?? '').trim().toLowerCase();
  const s = (destinoSupervisao ?? '').trim().toLowerCase();
  const normalize = (v: string) =>
    (v ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const bn = normalize(b);
  const sn = normalize(s);
  if (b === s) return true;
  if (destinoSupervisao === SUPERVISAO_RETIRADA && (b === 'retirada' || b.includes('retirada'))) return true;
  if (destinoSupervisao === SUPERVISAO_ENTREGA_GT && b.includes('entrega') && b.includes('teresina')) return true;
  if (
    destinoSupervisao === SUPERVISAO_SO_MOVEIS &&
    (
      b === 'requisição' ||
      b.includes('requisição') ||
      b.includes('requisicao') ||
      bn.includes('so moveis') ||
      bn.includes('moveis')
    )
  ) return true;
  if (s.startsWith('rota') && b.startsWith('rota')) {
    const normalizeRota = (v: string) =>
      v
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s*-\s*\d{2}\/\d{2}\/\d{4}\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    const bn = normalizeRota(b);
    const sn = normalizeRota(s);
    if (bn === sn) return true;
    if (bn.includes(sn) || sn.includes(bn)) return true;
  }
  return false;
}

/**
 * Ordem de consumo: Requisição, ATRASADOS, depois colunas de data (por data).
 */
function getConsumptionOrder(colKeys: string[]): string[] {
  return colKeys.slice().sort((a, b) => {
    if (a === 'Requisição') return -1;
    if (b === 'Requisição') return 1;
    if (a === 'ATRASADOS') return -1;
    if (b === 'ATRASADOS') return 1;
    return a.localeCompare(b);
  });
}

/**
 * Retorna { pedido, falta } para uma categoria de supervisão em um item.
 * Simula consumo por destino na ordem de prioridade: Requisição → ATRASADOS → colunas por data.
 * Dentro de cada coluna, cada destino consome na ordem do breakdown (prioridade por pedido).
 * Assim, um destino que vem depois na ordem consome o saldo restante corretamente (ex.: -8 em vez de -9).
 */
export function getSupervisaoCellForItem(
  item: {
    routeData: Record<string, { pedido: number; falta: number; breakdown?: { destino: string; qty: number }[] }>;
    estoqueAtual?: number;
  },
  categoriaKey: string,
  options?: {
    allowedDateKeys?: Set<string>;
    limitSpecialToAllowedDates?: boolean;
    /** Quando informado, restringe consumo e soma apenas às colunas visíveis (ex.: datas das rotas selecionadas no PDF). */
    visibleColKeysForConsumption?: string[];
  }
): { pedido: number; falta: number } {
  const destino = getDestinoFromCategoriaKey(categoriaKey);
  const limitByAllowedDates =
    !!options?.limitSpecialToAllowedDates &&
    SUPERVISAO_DESTINOS_ESPECIAIS.has(destino) &&
    !!options?.allowedDateKeys &&
    options.allowedDateKeys.size > 0;

  if (destino === SUPERVISAO_SO_MOVEIS) {
    const rd = getRequisicaoRouteData(item);
    return rd ? { pedido: Math.round(rd.pedido), falta: Math.round(rd.falta) } : { pedido: 0, falta: 0 };
  }

  const fullColKeys = Object.keys(item.routeData);
  const colKeysToUse = options?.visibleColKeysForConsumption?.length
    ? options.visibleColKeysForConsumption.filter((k) => fullColKeys.includes(k))
    : fullColKeys;
  const colKeysForSum = limitByAllowedDates && options?.allowedDateKeys?.size
    ? colKeysToUse.filter((key) => options!.allowedDateKeys!.has(key))
    : colKeysToUse;
  const consumptionOrder = getConsumptionOrder(colKeysToUse);
  let runningBalance = Math.max(0, item.estoqueAtual ?? 0);
  let pedido = 0;
  let falta = 0;

  for (const colKey of consumptionOrder) {
    const rd = item.routeData[colKey];
    if (!rd?.breakdown) continue;
    const colInSum = colKeysForSum.includes(colKey);
    for (const b of rd.breakdown) {
      if (destinoMatches(b.destino, destino)) {
        if (colInSum) pedido += b.qty;
        const needed = b.qty;
        if (runningBalance >= needed) {
          runningBalance -= needed;
        } else {
          const missing = needed - runningBalance;
          if (colInSum) falta += -missing;
          runningBalance = 0;
        }
      } else {
        runningBalance = Math.max(0, runningBalance - b.qty);
      }
    }
  }
  const pedidoRounded = Math.round(pedido);
  const faltaRounded = Math.round(falta);
  const faltaClamped = pedidoRounded <= 0 ? 0 : Math.max(faltaRounded, -pedidoRounded);
  return { pedido: pedidoRounded, falta: faltaClamped };
}

/** Verifica se o item tem pedido em alguma das categorias de supervisão selecionadas */
export function itemHasPedidoInSupervisaoCategorias(
  item: { routeData: Record<string, { pedido: number; breakdown?: { destino: string }[] }> },
  categoriaKeys: Set<string>,
  options?: {
    allowedDateKeys?: Set<string>;
    limitSpecialToAllowedDates?: boolean;
  }
): boolean {
  for (const key of categoriaKeys) {
    const destino = getDestinoFromCategoriaKey(key);
    const isDestinoEspecial = SUPERVISAO_DESTINOS_ESPECIAIS.has(destino);
    const shouldLimitToDates =
      !!options?.limitSpecialToAllowedDates &&
      isDestinoEspecial &&
      !!options?.allowedDateKeys &&
      options.allowedDateKeys.size > 0;

    if (shouldLimitToDates) {
      const cell = getSupervisaoCellForItem(
        item as {
          routeData: Record<string, { pedido: number; falta: number; breakdown?: { destino: string; qty: number }[] }>;
          estoqueAtual?: number;
        },
        key,
        {
          allowedDateKeys: options?.allowedDateKeys,
          limitSpecialToAllowedDates: true,
        }
      );
      if (cell.pedido > 0) return true;
      continue;
    }

    if (destino === SUPERVISAO_SO_MOVEIS) {
      const rd = getRequisicaoRouteData(item as {
        routeData: Record<string, { pedido: number; falta: number; breakdown?: { destino: string; qty: number }[] }>;
      });
      if (rd?.pedido > 0) return true;
      continue;
    }
    for (const rd of Object.values(item.routeData)) {
      if (!rd.breakdown || rd.pedido <= 0) continue;
      if (rd.breakdown.some((b) => b.destino === destino)) return true;
    }
  }
  return false;
}
