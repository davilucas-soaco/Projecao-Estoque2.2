-- Tabela delivery_sequence (Sequenciamento de entrega).
-- Armazena a ordem e data de saída das rotas para sincronização em tempo real entre máquinas.
-- Execute no SQL Editor do projeto Supabase.

CREATE TABLE IF NOT EXISTS delivery_sequence (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para ordenação eficiente
CREATE INDEX IF NOT EXISTS idx_delivery_sequence_order ON delivery_sequence(order_index);

ALTER TABLE delivery_sequence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura delivery_sequence"
  ON delivery_sequence FOR SELECT
  USING (true);

CREATE POLICY "Permitir inserção delivery_sequence"
  ON delivery_sequence FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir atualização delivery_sequence"
  ON delivery_sequence FOR UPDATE
  USING (true);

CREATE POLICY "Permitir exclusão delivery_sequence"
  ON delivery_sequence FOR DELETE
  USING (true);

-- Habilitar Realtime: vá em Database > Replication no Dashboard do Supabase
-- e adicione a tabela "delivery_sequence" à publicação supabase_realtime,
-- ou execute: ALTER PUBLICATION supabase_realtime ADD TABLE delivery_sequence;
