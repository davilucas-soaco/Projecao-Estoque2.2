import type { Order, StockItem } from './types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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

export async function fetchStock(): Promise<StockItem[]> {
  const res = await fetch(`${API_BASE}/api/stock`);
  return handleResponse<StockItem[]>(res);
}

export async function fetchOrders(): Promise<Order[]> {
  const res = await fetch(`${API_BASE}/api/orders`);
  return handleResponse<Order[]>(res);
}
