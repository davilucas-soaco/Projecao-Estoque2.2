-- Tabelas romaneio e estoque para importação via interface (substitui dependência da API MySQL).
-- Execute no SQL Editor do projeto Supabase (uma vez). As tabelas são criadas automaticamente só via este script.

-- ---------------------------------------------------------------------------
-- Romaneio (pedidos / romaneio)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS romaneio (
  id BIGSERIAL PRIMARY KEY,
  codigo_romaneio INTEGER,
  observacoes_romaneio TEXT,
  data_emissao_romaneio TIMESTAMPTZ,
  n_pedido TEXT,
  cliente TEXT,
  data_emissao_pedido DATE,
  cod_produto TEXT,
  descricao TEXT,
  um TEXT,
  qtd_pedida NUMERIC(20,4) DEFAULT 0,
  qtd_vinculada_no_romaneio NUMERIC(20,4) DEFAULT 0,
  tipo_de_produto_do_item_de_pedido_de_venda TEXT,
  preco_unitario NUMERIC(20,4) DEFAULT 0,
  data_de_entrega TIMESTAMPTZ,
  municipio TEXT,
  uf TEXT,
  endereco TEXT,
  metodo_de_entrega TEXT,
  requisicao_de_loja_do_grupo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE romaneio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura romaneio"
  ON romaneio FOR SELECT USING (true);
CREATE POLICY "Permitir inserção romaneio"
  ON romaneio FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização romaneio"
  ON romaneio FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão romaneio"
  ON romaneio FOR DELETE USING (true);

-- ---------------------------------------------------------------------------
-- Estoque
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estoque (
  id BIGSERIAL PRIMARY KEY,
  id_produto INTEGER,
  codigo TEXT,
  id_tipo_produto INTEGER,
  setor_estoque_padrao TEXT,
  descricao TEXT,
  setor_estoque TEXT,
  saldo_setor_final NUMERIC(20,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE estoque ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura estoque"
  ON estoque FOR SELECT USING (true);
CREATE POLICY "Permitir inserção estoque"
  ON estoque FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização estoque"
  ON estoque FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão estoque"
  ON estoque FOR DELETE USING (true);
