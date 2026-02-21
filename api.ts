import type { Order, StockItem } from './types';
import { supabase, fetchRomaneio, fetchEstoque } from './supabaseClient';

// Vazio ou não definido = mesmo domínio (deploy único). Senão = URL do backend (ex.: Vercel + Railway).
const API_BASE = (import.meta.env.VITE_API_URL === '' || import.meta.env.VITE_API_URL == null)
  ? ''
  : (import.meta.env.VITE_API_URL || 'http://localhost:3000');

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('Acesso não autorizado. Faça login novamente.');
    }
    const text = await res.text();
    let message = 'Erro ao comunicar com o servidor.';
    try {
      const json = JSON.parse(text);
      if (json?.error) message = json.error;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  return res.json();
}

/** Se Supabase está configurado, lê estoque do Supabase; senão usa a API (MySQL). */
export async function fetchStock(): Promise<StockItem[]> {
  if (supabase) return fetchEstoque();
  const res = await fetch(`${API_BASE}/api/stock`);
  return handleResponse<StockItem[]>(res);
}

/** Se Supabase está configurado, lê romaneio do Supabase; senão usa a API (MySQL). */
export async function fetchOrders(): Promise<Order[]> {
  if (supabase) return fetchRomaneio();
  const res = await fetch(`${API_BASE}/api/orders`);
  return handleResponse<Order[]>(res);
}
