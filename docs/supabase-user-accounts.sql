-- Tabela user_accounts (Gestão de usuários).
-- Armazena usuários do sistema para sincronização em tempo real entre máquinas.
-- Execute no SQL Editor do projeto Supabase.
--
-- IMPORTANTE: Este sistema usa senha em texto plano para compatibilidade com o fluxo atual.
-- Recomenda-se futura migração para Supabase Auth com senhas hasheadas.

CREATE TABLE IF NOT EXISTS user_accounts (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  profile TEXT NOT NULL DEFAULT 'CONSULTA' CHECK (profile IN ('ADMIN', 'PCP', 'CONSULTA')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para busca por username (login)
CREATE INDEX IF NOT EXISTS idx_user_accounts_username ON user_accounts(username);

ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura user_accounts"
  ON user_accounts FOR SELECT
  USING (true);

CREATE POLICY "Permitir inserção user_accounts"
  ON user_accounts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir atualização user_accounts"
  ON user_accounts FOR UPDATE
  USING (true);

CREATE POLICY "Permitir exclusão user_accounts"
  ON user_accounts FOR DELETE
  USING (true);

-- Habilitar Realtime: vá em Database > Replication no Dashboard do Supabase
-- e adicione a tabela "user_accounts" à publicação supabase_realtime,
-- ou execute: ALTER PUBLICATION supabase_realtime ADD TABLE user_accounts;
