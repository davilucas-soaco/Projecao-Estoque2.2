import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não definidos. shelf_ficha não será carregado.');
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

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
