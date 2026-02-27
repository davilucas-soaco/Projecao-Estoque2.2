import type { StockItem } from './types';

const CONFIGURED_API_BASE = import.meta.env.VITE_API_URL?.trim();

function getApiBaseCandidates(): string[] {
  const candidates: string[] = [];
  if (CONFIGURED_API_BASE) candidates.push(CONFIGURED_API_BASE);

  if (typeof window !== 'undefined') {
    const fromHost = `${window.location.protocol}//${window.location.hostname}:3000`;
    candidates.push(fromHost);
  }

  candidates.push('http://localhost:3000');

  // Remove duplicados e barras finais
  return Array.from(new Set(candidates.map((u) => u.replace(/\/+$/, ''))));
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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
  const bases = getApiBaseCandidates();
  const errors: string[] = [];

  for (const base of bases) {
    try {
      const res = await fetchWithTimeout(`${base}/api/stock`);
      return handleResponse<StockItem[]>(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${base} -> ${msg}`);
    }
  }

  throw new Error(
    `Não foi possível conectar à API de estoque. URLs testadas: ${bases.join(', ')}. ` +
      `Se necessário, ajuste VITE_API_URL no .env e reinicie o Vite.`
  );
}
