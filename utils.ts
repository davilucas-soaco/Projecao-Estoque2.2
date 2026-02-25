
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

  const norm = normalizeText(base);
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
  end.setDate(start.getDate() + 13);
  const formatDate = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return {
    start,
    end,
    label: `Horizonte: ${formatDate(start)} até ${formatDate(end)}`
  };
};
