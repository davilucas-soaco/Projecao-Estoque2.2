import { createClient } from '@supabase/supabase-js';
import type { UserAccount, ProjecaoImportada } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não definidos. shelf_ficha não será carregado.');
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

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

// --- Company Config (Logo da empresa + metadados diversos) ---

const COMPANY_LOGO_KEY = 'company_logo';
const PROJECTION_UPLOAD_AT_KEY = 'last_projecao_upload_at';
const PROJECTION_UPLOAD_USER_KEY = 'last_projecao_upload_user';
const STOCK_SYNC_AT_KEY = 'last_stock_sync_at';

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

export async function fetchProjectionUploadMeta(): Promise<{ lastUploadAt: string | null; lastUploadUser: string | null }> {
  if (!supabase) return { lastUploadAt: null, lastUploadUser: null };

  const [{ data: atData, error: atError }, { data: userData, error: userError }] = await Promise.all([
    supabase.from('company_config').select('value').eq('key', PROJECTION_UPLOAD_AT_KEY).maybeSingle(),
    supabase.from('company_config').select('value').eq('key', PROJECTION_UPLOAD_USER_KEY).maybeSingle(),
  ]);

  if (atError) throw new Error(atError.message);
  if (userError) throw new Error(userError.message);

  return {
    lastUploadAt: atData?.value ?? null,
    lastUploadUser: userData?.value ?? null,
  };
}

export async function upsertProjectionUploadMeta(params: { at: string; user: string }): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const now = new Date().toISOString();
  const { error } = await supabase.from('company_config').upsert(
    [
      { key: PROJECTION_UPLOAD_AT_KEY, value: params.at, updated_at: now },
      { key: PROJECTION_UPLOAD_USER_KEY, value: params.user, updated_at: now },
    ],
    { onConflict: 'key' }
  );
  if (error) throw new Error(error.message);
}

export async function fetchStockSyncMeta(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('company_config')
    .select('value')
    .eq('key', STOCK_SYNC_AT_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value ?? null;
}

export async function upsertStockSyncMeta(at: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase
    .from('company_config')
    .upsert({ key: STOCK_SYNC_AT_KEY, value: at, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
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

// --- Projeção Importada ---

export type ProjecaoImportadaRow = {
  id: string;
  id_chave: string;
  observacoes: string | null;
  rm: string | null;
  pd: string | null;
  cliente: string | null;
  cod: string | null;
  descricao_produto: string | null;
  setor_producao: string | null;
  status: string | null;
  requisicao_loja_grupo: string | null;
  uf: string | null;
  municipio_entrega: string | null;
  qtde_pendente_real: number | null;
  tipo_f: string | null;
  emissao: string | null;
  data_original: string | null;
  previsao_anterior: string | null;
  previsao_atual: string | null;
  created_at?: string;
  updated_at?: string;
};

function rowToProjecaoImportada(row: ProjecaoImportadaRow): ProjecaoImportada {
  return {
    idChave: row.id_chave,
    observacoes: row.observacoes ?? '',
    rm: row.rm ?? '',
    pd: row.pd ?? '',
    cliente: row.cliente ?? '',
    cod: row.cod ?? '',
    descricaoProduto: row.descricao_produto ?? '',
    setorProducao: row.setor_producao ?? '',
    status: row.status ?? '',
    requisicaoLojaGrupo: row.requisicao_loja_grupo ?? '',
    uf: row.uf ?? '',
    municipioEntrega: row.municipio_entrega ?? '',
    qtdePendenteReal: row.qtde_pendente_real ?? 0,
    tipoF: row.tipo_f ?? '',
    emissao: row.emissao ?? '',
    dataOriginal: row.data_original ?? '',
    previsaoAnterior: row.previsao_anterior ?? '',
    previsaoAtual: row.previsao_atual ?? '',
  };
}

function projecaoImportadaToRow(p: ProjecaoImportada): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id_chave: p.idChave,
    observacoes: p.observacoes,
    rm: p.rm,
    pd: p.pd,
    cliente: p.cliente,
    cod: p.cod,
    descricao_produto: p.descricaoProduto,
    setor_producao: p.setorProducao,
    status: p.status,
    requisicao_loja_grupo: p.requisicaoLojaGrupo,
    uf: p.uf,
    municipio_entrega: p.municipioEntrega,
    qtde_pendente_real: p.qtdePendenteReal,
    tipo_f: p.tipoF,
    emissao: p.emissao,
    data_original: p.dataOriginal,
    previsao_anterior: p.previsaoAnterior,
    previsao_atual: p.previsaoAtual,
    updated_at: now,
  };
}

export async function fetchProjecaoImportada(): Promise<ProjecaoImportada[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('projecao_importada')
    .select('*')
    .order('emissao', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => rowToProjecaoImportada(row as ProjecaoImportadaRow));
}

export async function replaceProjecaoImportada(rows: ProjecaoImportada[]): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');

  const ids = Array.from(new Set(rows.map((r) => r.idChave).filter((v) => v && v.trim() !== '')));

  const { data: existing, error: existingError } = await supabase
    .from('projecao_importada')
    .select('id_chave');
  if (existingError) throw new Error(existingError.message);

  const existingKeys = new Set((existing || []).map((r: { id_chave: string }) => r.id_chave));
  const incomingKeys = new Set(ids);

  const toDelete = Array.from(existingKeys).filter((key) => !incomingKeys.has(key));

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('projecao_importada')
      .delete()
      .in('id_chave', toDelete);
    if (deleteError) throw new Error(deleteError.message);
  }

  if (rows.length > 0) {
    const toUpsert = rows.map((r) => projecaoImportadaToRow(r));
    const { error: upsertError } = await supabase
      .from('projecao_importada')
      .upsert(toUpsert, { onConflict: 'id_chave' });
    if (upsertError) throw new Error(upsertError.message);
  }
}
