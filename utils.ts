
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

  if (norm.includes('RETIRADA')) {
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

export const getHorizonInfo = () => {
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 14);
  const formatDate = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return {
    start,
    end,
    label: `Horizonte: ${formatDate(start)} até ${formatDate(end)}`
  };
};

/** Retorna a data de hoje zerada (meia-noite) */
export const getTodayStart = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Gera colunas de data para projeção: Atrasados + 15 dias futuros */
export const getDateColumns = (): { key: string; label: string; date: Date | null; isAtrasados: boolean }[] => {
  const today = getTodayStart();
  const cols: { key: string; label: string; date: Date | null; isAtrasados: boolean }[] = [
    { key: 'ATRASADOS', label: 'Atrasados até hoje', date: null, isAtrasados: true }
  ];
  for (let i = 1; i <= 15; i++) {
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
