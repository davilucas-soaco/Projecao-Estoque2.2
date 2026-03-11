import type { StockItem } from './types';

const CONFIGURED_API_BASE = import.meta.env.VITE_API_URL?.trim();

function isPrivateHost(hostname: string): boolean {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') return true;
  if (h.startsWith('10.')) return true;
  if (h.startsWith('192.168.')) return true;
  const m = h.match(/^172\.(\d{1,3})\./);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function isPublicContext(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return !isPrivateHost(host);
}

function shouldSkipCandidate(base: string): boolean {
  if (!isPublicContext()) return false;
  try {
    const u = new URL(base);
    return isPrivateHost(u.hostname);
  } catch {
    return false;
  }
}

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
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const text = await res.text();
    const preview = text.slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(`Resposta inesperada da API (não-JSON). Início da resposta: ${preview}`);
  }
  return res.json();
}

export async function fetchStock(): Promise<StockItem[]> {
  const bases = getApiBaseCandidates().filter((base) => !shouldSkipCandidate(base));
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
