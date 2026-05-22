import type { ComponentData, ProductConsolidated } from '../types';

export type SaldoProjetadoItem = ProductConsolidated | ComponentData;

/** Saldo projetado fixo da linha: estoque atual − pedido total. */
export const computeSaldoProjetado = (item: SaldoProjetadoItem): number | '-' => {
  if ('isShelf' in item && (item as ProductConsolidated).isShelf) return '-';
  const est = Number((item as ProductConsolidated).estoqueAtual);
  const ped = Number(item.totalPedido ?? 0);
  if (Number.isNaN(est)) return '-';
  return est - ped;
};

export const formatSaldoProjetadoCell = (saldo: number | '-' | unknown): string | number => {
  if (saldo === '-') return '-';
  const n = Number(saldo);
  if (Number.isNaN(n) || n === 0) return '-';
  return Math.round(n);
};

export const saldoProjetadoFilterKey = (item: SaldoProjetadoItem): string => {
  const saldo = computeSaldoProjetado(item);
  if (saldo === '-') return '-';
  return String(formatSaldoProjetadoCell(saldo));
};
