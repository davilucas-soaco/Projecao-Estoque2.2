
import { Order } from './types';

export const ROUTE_G_TERESINA = "Entrega G.Teresina";
export const ROUTE_SO_MOVEIS = "Só Móveis";
export const ROUTE_CLIENTE_BUSCA = "Cliente vem buscar";
export const CIDADES_G_TERESINA = [
  { cidade: 'TERESINA', uf: 'PI' },
  { cidade: 'TIMON', uf: 'MA' },
  { cidade: 'DEMERVAL LOBÃO', uf: 'PI' },
  { cidade: 'DEMERVAL', uf: 'PI' },
  { cidade: 'JOSE DE FREITAS', uf: 'PI' },
  { cidade: 'NAZARIA', uf: 'PI' }
];

export const normalizeText = (str: string | undefined | null): string => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .toUpperCase()
    .trim();
};

// 1. Prioridade Máxima: Só Móveis
export const isSoMoveis = (order: Order): boolean => {
  return order.requisicaoLoja === true;
};

// 2. Segunda Prioridade: Cliente vem buscar
export const isClienteVemBuscar = (order: Order): boolean => {
  // Se for Só Móveis, não entra aqui (Prioridade 1 já tratou)
  if (isSoMoveis(order)) return false;

  const endNorm = normalizeText(order.endereco);
  
  // Regex para "COLETORA" ou "COL"
  const coletoraPattern = /(COL|COLETORA)/;
  // Regex para "SECUNDARIA" ou "SEC"
  const secundariaPattern = /(SEC|SECUNDARIA)/;

  const hasColetoraLike = coletoraPattern.test(endNorm);
  const hasSecundariaLike = secundariaPattern.test(endNorm);

  return hasColetoraLike && hasSecundariaLike;
};

// 3. Terceira Prioridade: Grande Teresina
export const isEligibleForGTeresina = (order: Order): boolean => {
  // Se for Só Móveis ou Cliente vem buscar, não entra aqui (Prioridades 1 e 2 já trataram)
  if (isSoMoveis(order) || isClienteVemBuscar(order)) return false;

  const metodoNorm = normalizeText(order.metodoEntrega);
  if (metodoNorm !== normalizeText("Entrega Pelo Grupo Só Aço")) return false;

  const municipioReal = order.localEntregaDif === 1 
    ? normalizeText(order.municipioEntrega)
    : normalizeText(order.municipioCliente);
  const finalMunicipio = municipioReal || normalizeText(order.municipio);
  const finalUf = order.localEntregaDif === 1 ? normalizeText(order.ufEntrega) : normalizeText(order.ufCliente) || normalizeText(order.uf);

  return CIDADES_G_TERESINA.some(
    loc => normalizeText(loc.cidade) === finalMunicipio && normalizeText(loc.uf) === finalUf
  );
};

// 4. Quarta Prioridade: Rotas Normais (Verificado no processamento pelo Codigo_Romaneio)
export const isRotaNormal = (order: Order): boolean => {
  if (isSoMoveis(order) || isClienteVemBuscar(order) || isEligibleForGTeresina(order)) return false;
  return !!order.codigoRomaneio && order.codigoRomaneio.trim() !== "";
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
