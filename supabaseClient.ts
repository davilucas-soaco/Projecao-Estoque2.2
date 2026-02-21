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

// ---------------------------------------------------------------------------
// Romaneio e Estoque (importação; substituem API MySQL)
// Execute docs/supabase-romaneio-estoque.sql no Supabase uma vez para criar as tabelas.
// ---------------------------------------------------------------------------

export type RomaneioRow = {
  id?: number;
  codigo_romaneio: number | null;
  observacoes_romaneio: string | null;
  data_emissao_romaneio: string | null;
  n_pedido: string | null;
  cliente: string | null;
  data_emissao_pedido: string | null;
  cod_produto: string | null;
  descricao: string | null;
  um: string | null;
  qtd_pedida: number | null;
  qtd_vinculada_no_romaneio: number | null;
  tipo_de_produto_do_item_de_pedido_de_venda: string | null;
  preco_unitario: number | null;
  data_de_entrega: string | null;
  municipio: string | null;
  uf: string | null;
  endereco: string | null;
  metodo_de_entrega: string | null;
  requisicao_de_loja_do_grupo: string | null;
};

export type EstoqueRow = {
  id?: number;
  id_produto: number | null;
  codigo: string | null;
  id_tipo_produto: number | null;
  setor_estoque_padrao: string | null;
  descricao: string | null;
  setor_estoque: string | null;
  saldo_setor_final: number | null;
};

function toNum(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function romaneioRowToOrder(row: Record<string, unknown>): import('./types').Order {
  const req = String((row.requisicao_de_loja_do_grupo ?? '') || '').toLowerCase();
  return {
    codigoRomaneio: String(row.codigo_romaneio ?? ''),
    observacoesRomaneio: String(row.observacoes_romaneio ?? ''),
    dataEmissaoRomaneio: row.data_emissao_romaneio ? String(row.data_emissao_romaneio) : '',
    numeroPedido: String(row.n_pedido ?? ''),
    cliente: String(row.cliente ?? ''),
    dataEmissaoPedido: row.data_emissao_pedido ? String(row.data_emissao_pedido) : '',
    codigoProduto: String(row.cod_produto ?? ''),
    descricao: String(row.descricao ?? ''),
    um: String(row.um ?? ''),
    qtdPedida: toNum(row.qtd_pedida),
    qtdVinculada: toNum(row.qtd_vinculada_no_romaneio),
    tipoProduto: String(row.tipo_de_produto_do_item_de_pedido_de_venda ?? ''),
    precoUnitario: toNum(row.preco_unitario),
    dataEntrega: row.data_de_entrega ? String(row.data_de_entrega) : '',
    municipio: String(row.municipio ?? ''),
    uf: String(row.uf ?? ''),
    endereco: String(row.endereco ?? ''),
    metodoEntrega: String(row.metodo_de_entrega ?? ''),
    requisicaoLoja: req.includes('sim'),
    localEntregaDif: 0,
    municipioCliente: String(row.municipio ?? ''),
    ufCliente: String(row.uf ?? ''),
    municipioEntrega: String(row.municipio ?? ''),
    ufEntrega: String(row.uf ?? ''),
  };
}

function estoqueRowToItem(row: Record<string, unknown>): import('./types').StockItem {
  return {
    idProduto: toNum(row.id_produto),
    codigo: String(row.codigo ?? ''),
    idTipoProduto: toNum(row.id_tipo_produto),
    setorEstoquePadrao: String(row.setor_estoque_padrao ?? ''),
    descricao: String(row.descricao ?? ''),
    setorEstoque: String(row.setor_estoque ?? ''),
    saldoSetorFinal: toNum(row.saldo_setor_final),
  };
}

export async function fetchRomaneio(): Promise<import('./types').Order[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('romaneio').select('*').order('id');
  if (error) {
    if (error.message.includes('does not exist')) {
      throw new Error(
        'Tabela romaneio não existe. Execute o script docs/supabase-romaneio-estoque.sql no SQL Editor do Supabase.'
      );
    }
    throw new Error(error.message);
  }
  return (data || []).map(romaneioRowToOrder);
}

export async function fetchEstoque(): Promise<import('./types').StockItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('estoque').select('*').order('id');
  if (error) {
    if (error.message.includes('does not exist')) {
      throw new Error(
        'Tabela estoque não existe. Execute o script docs/supabase-romaneio-estoque.sql no SQL Editor do Supabase.'
      );
    }
    throw new Error(error.message);
  }
  return (data || []).map(estoqueRowToItem);
}

function orderToRomaneioRow(o: import('./types').Order): Record<string, unknown> {
  return {
    codigo_romaneio: o.codigoRomaneio ? parseInt(String(o.codigoRomaneio), 10) || null : null,
    observacoes_romaneio: o.observacoesRomaneio || null,
    data_emissao_romaneio: o.dataEmissaoRomaneio || null,
    n_pedido: o.numeroPedido || null,
    cliente: o.cliente || null,
    data_emissao_pedido: o.dataEmissaoPedido || null,
    cod_produto: o.codigoProduto || null,
    descricao: o.descricao || null,
    um: o.um || null,
    qtd_pedida: o.qtdPedida,
    qtd_vinculada_no_romaneio: o.qtdVinculada,
    tipo_de_produto_do_item_de_pedido_de_venda: o.tipoProduto || null,
    preco_unitario: o.precoUnitario,
    data_de_entrega: o.dataEntrega || null,
    municipio: o.municipio || null,
    uf: o.uf || null,
    endereco: o.endereco || null,
    metodo_de_entrega: o.metodoEntrega || null,
    requisicao_de_loja_do_grupo: o.requisicaoLoja ? 'Sim' : 'Não',
  };
}

function stockItemToEstoqueRow(s: import('./types').StockItem): Record<string, unknown> {
  return {
    id_produto: s.idProduto,
    codigo: s.codigo || null,
    id_tipo_produto: s.idTipoProduto,
    setor_estoque_padrao: s.setorEstoquePadrao || null,
    descricao: s.descricao || null,
    setor_estoque: s.setorEstoque || null,
    saldo_setor_final: s.saldoSetorFinal,
  };
}

/** Limpa a tabela romaneio e insere os registros (substituição total). */
export async function replaceRomaneio(orders: import('./types').Order[]): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error: delErr } = await supabase.from('romaneio').delete().neq('id', 0);
  if (delErr) throw new Error(delErr.message);
  if (orders.length === 0) return;
  const rows = orders.map(orderToRomaneioRow);
  const { error: insErr } = await supabase.from('romaneio').insert(rows);
  if (insErr) throw new Error(insErr.message);
}

/** Limpa a tabela estoque e insere os registros (substituição total). */
export async function replaceEstoque(stock: import('./types').StockItem[]): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error: delErr } = await supabase.from('estoque').delete().neq('id', 0);
  if (delErr) throw new Error(delErr.message);
  if (stock.length === 0) return;
  const rows = stock.map(stockItemToEstoqueRow);
  const { error: insErr } = await supabase.from('estoque').insert(rows);
  if (insErr) throw new Error(insErr.message);
}
