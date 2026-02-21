-- Tabela shelf_ficha (MiniFicha) conforme PRD.
-- Execute no SQL Editor do projeto Supabase.

CREATE TABLE IF NOT EXISTS shelf_ficha (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_estante TEXT NOT NULL,
  desc_estante TEXT,
  cod_coluna TEXT NOT NULL,
  desc_coluna TEXT NOT NULL,
  qtd_coluna INTEGER NOT NULL DEFAULT 0,
  cod_bandeja TEXT NOT NULL,
  desc_bandeja TEXT NOT NULL,
  qtd_bandeja INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT shelf_ficha_estante_coluna_bandeja_key UNIQUE (codigo_estante, cod_coluna, cod_bandeja)
);

ALTER TABLE shelf_ficha ENABLE ROW LEVEL SECURITY;

-- Políticas RLS: permitir leitura e escrita para anon/authenticated (ajuste conforme sua estratégia de auth).
CREATE POLICY "Permitir leitura shelf_ficha"
  ON shelf_ficha FOR SELECT
  USING (true);

CREATE POLICY "Permitir inserção shelf_ficha"
  ON shelf_ficha FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir atualização shelf_ficha"
  ON shelf_ficha FOR UPDATE
  USING (true);

CREATE POLICY "Permitir exclusão shelf_ficha"
  ON shelf_ficha FOR DELETE
  USING (true);
