
import { Order } from './types';

export const ROUTE_G_TERESINA = "Entrega G.Teresina";
export const ROUTE_SO_MOVEIS = "Só Móveis";
export const CIDADES_G_TERESINA = ['TERESINA', 'TIMON', 'DEMERVAL', 'JOSE DE FREITAS', 'NAZARIA'];

export const normalizeText = (str: string | undefined | null): string => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .toUpperCase()
    .trim();
};

export const isEligibleForGTeresina = (order: Order): boolean => {
  // Regra de Prioridade: Se for Requisição de Loja (Só Móveis), não é elegível para G.Teresina
  if (order.requisicaoLoja === true) return false;

  const metodoNorm = normalizeText(order.metodoEntrega);
  if (metodoNorm !== normalizeText("Entrega Pelo Grupo Só Aço")) return false;

  const municipioReal = order.localEntregaDif === 1 
    ? normalizeText(order.municipioEntrega)
    : normalizeText(order.municipioCliente);

  const finalMunicipio = municipioReal || normalizeText(order.municipio);

  return CIDADES_G_TERESINA.some(cidade => finalMunicipio.includes(cidade));
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
