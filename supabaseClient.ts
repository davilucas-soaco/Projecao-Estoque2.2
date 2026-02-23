import { createClient } from '@supabase/supabase-js';
import type { Route, UserAccount } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não definidos. shelf_ficha não será carregado.');
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// --- Delivery Sequence (Sequenciamento de entrega) ---

export type DeliverySequenceRow = {
  id: string;
  name: string;
  date: string;
  order_index: number;
  created_at?: string;
  updated_at?: string;
};

function rowToRoute(row: DeliverySequenceRow): Route {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    order: row.order_index,
  };
}

export async function fetchDeliverySequence(): Promise<Route[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('delivery_sequence')
    .select('*')
    .order('order_index', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(rowToRoute);
}

export async function upsertDeliverySequence(routes: Route[]): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const rows = routes.map((r, i) => ({
    id: r.id,
    name: r.name,
    date: r.date,
    order_index: r.order ?? i + 1,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('delivery_sequence').upsert(rows, {
    onConflict: 'id',
  });
  if (error) throw new Error(error.message);
}

export async function deleteDeliverySequence(ids: string[]): Promise<void> {
  if (!supabase || ids.length === 0) return;
  const { error } = await supabase.from('delivery_sequence').delete().in('id', ids);
  if (error) throw new Error(error.message);
}

/** Substitui todo o sequenciamento: remove rotas que não estão mais na lista e faz upsert do restante */
export async function syncDeliverySequenceFull(routes: Route[]): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const routeIds = new Set(routes.map((r) => r.id));
  const { data: existing } = await supabase.from('delivery_sequence').select('id');
  const toDelete = (existing || []).map((r) => r.id).filter((id) => !routeIds.has(id));
  if (toDelete.length > 0) {
    await deleteDeliverySequence(toDelete);
  }
  if (routes.length > 0) {
    await upsertDeliverySequence(routes);
  }
}

export function subscribeDeliverySequence(callback: (routes: Route[]) => void): () => void {
  if (!supabase) return () => {};
  const refetch = async () => {
    const routes = await fetchDeliverySequence();
    callback(routes);
  };
  const channel = supabase
    .channel('delivery-sequence-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'delivery_sequence' },
      () => refetch()
    )
    .subscribe();
  refetch();
  return () => {
    supabase.removeChannel(channel);
  };
}

// --- User Accounts (Gestão de usuários) ---

export type UserAccountRow = {
  id: string;
  username: string;
  name: string;
  password: string;
  profile: string;
  created_at?: string;
  updated_at?: string;
};

function rowToUserAccount(row: UserAccountRow): UserAccount {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    password: row.password,
    profile: row.profile as UserAccount['profile'],
  };
}

export async function fetchUserAccounts(): Promise<UserAccount[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('user_accounts')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(rowToUserAccount);
}

export async function upsertUserAccount(user: UserAccount): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const row = {
    id: user.id,
    username: user.username.toLowerCase().trim(),
    name: user.name,
    password: user.password,
    profile: user.profile,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('user_accounts').upsert(row, {
    onConflict: 'id',
  });
  if (error) throw new Error(error.message);
}

export async function deleteUserAccount(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('user_accounts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export function subscribeUserAccounts(callback: (users: UserAccount[]) => void): () => void {
  if (!supabase) return () => {};
  const refetch = async () => {
    const users = await fetchUserAccounts();
    callback(users);
  };
  const channel = supabase
    .channel('user-accounts-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_accounts' },
      () => refetch()
    )
    .subscribe();
  refetch();
  return () => {
    supabase.removeChannel(channel);
  };
}

// --- Company Config (Logo da empresa) ---

const COMPANY_LOGO_KEY = 'company_logo';

export async function fetchCompanyLogo(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('company_config')
    .select('value')
    .eq('key', COMPANY_LOGO_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value ?? null;
}

export async function upsertCompanyLogo(logoDataUrl: string | null): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase
    .from('company_config')
    .upsert({ key: COMPANY_LOGO_KEY, value: logoDataUrl, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

export function subscribeCompanyLogo(callback: (logo: string | null) => void): () => void {
  if (!supabase) return () => {};
  const refetch = async () => {
    const logo = await fetchCompanyLogo();
    callback(logo);
  };
  const channel = supabase
    .channel('company-logo-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'company_config' }, () => refetch())
    .subscribe();
  refetch();
  return () => supabase.removeChannel(channel);
}

// --- Shelf Ficha (MiniFicha) ---

export type ShelfFichaRow = {
  id: string;
  codigo_estante: string;
  desc_estante: string | null;
  cod_coluna: string;
  desc_coluna: string;
  qtd_coluna: number;
  cod_bandeja: string;
  desc_bandeja: string;
  qtd_bandeja: number;
  created_at?: string;
};

function rowToShelfFicha(row: ShelfFichaRow) {
  return {
    id: row.id,
    codigoEstante: row.codigo_estante,
    descEstante: row.desc_estante ?? undefined,
    codColuna: row.cod_coluna,
    descColuna: row.desc_coluna,
    qtdColuna: row.qtd_coluna,
    codBandeja: row.cod_bandeja,
    descBandeja: row.desc_bandeja,
    qtdBandeja: row.qtd_bandeja,
  };
}

export async function fetchShelfFicha(): Promise<import('./types').ShelfFicha[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('shelf_ficha').select('*').order('codigo_estante');
  if (error) throw new Error(error.message);
  return (data || []).map(rowToShelfFicha);
}

export function shelfFichaToRow(f: import('./types').ShelfFicha): Record<string, unknown> {
  const row: Record<string, unknown> = {
    codigo_estante: f.codigoEstante,
    desc_estante: f.descEstante ?? null,
    cod_coluna: f.codColuna,
    desc_coluna: f.descColuna,
    qtd_coluna: f.qtdColuna,
    cod_bandeja: f.codBandeja,
    desc_bandeja: f.descBandeja,
    qtd_bandeja: f.qtdBandeja,
  };
  if (f.id) row.id = f.id;
  return row;
}

export async function upsertShelfFicha(rows: import('./types').ShelfFicha[]): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const toInsert = rows.map(f => shelfFichaToRow(f));
  const { error } = await supabase.from('shelf_ficha').upsert(toInsert, {
    onConflict: 'codigo_estante,cod_coluna,cod_bandeja',
  });
  if (error) {
    if (error.message.includes('no unique or exclusion constraint')) {
      throw new Error(
        'A tabela shelf_ficha precisa da restrição UNIQUE em (codigo_estante, cod_coluna, cod_bandeja). ' +
        'Execute o script docs/supabase-shelf-ficha-fix-constraint.sql no SQL Editor do Supabase.'
      );
    }
    throw new Error(error.message);
  }
}
