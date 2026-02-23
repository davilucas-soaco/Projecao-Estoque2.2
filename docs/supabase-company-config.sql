-- Tabela company_config (configurações da empresa, ex: logo).
-- Compartilha a logo entre todas as máquinas em tempo real.
-- Execute no SQL Editor do projeto Supabase.

CREATE TABLE IF NOT EXISTS company_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inserir chave padrão para a logo
INSERT INTO company_config (key, value) VALUES ('company_logo', NULL)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE company_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura company_config"
  ON company_config FOR SELECT
  USING (true);

CREATE POLICY "Permitir inserção company_config"
  ON company_config FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir atualização company_config"
  ON company_config FOR UPDATE
  USING (true);

-- Habilitar Realtime: Database > Replication no Dashboard do Supabase
-- Adicione "company_config" à publicação supabase_realtime
