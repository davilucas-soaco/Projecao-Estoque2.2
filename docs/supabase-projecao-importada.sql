-- Tabela principal para projeção importada a partir da planilha
create table if not exists public.projecao_importada (
  id uuid primary key default gen_random_uuid(),
  id_chave text not null unique,
  observacoes text,
  rm text,
  pd text,
  cliente text,
  cod text,
  descricao_produto text,
  setor_producao text,
  status text,
  requisicao_loja_grupo text,
  uf text,
  municipio_entrega text,
  qtde_pendente_real numeric,
  tipo_f text,
  emissao text,
  data_original text,
  previsao_anterior text,
  previsao_atual text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Metadados em company_config já são utilizados para o logo.
-- Garanta que a tabela possua ao menos:
--   key (primary key text)
--   value text
--   updated_at timestamptz

