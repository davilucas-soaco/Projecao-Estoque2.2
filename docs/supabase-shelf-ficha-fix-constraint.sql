-- Se a tabela shelf_ficha já existir SEM a restrição UNIQUE, execute este script
-- no SQL Editor do Supabase para corrigir o erro:
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification"

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shelf_ficha_estante_coluna_bandeja_key'
  ) THEN
    ALTER TABLE shelf_ficha
    ADD CONSTRAINT shelf_ficha_estante_coluna_bandeja_key
    UNIQUE (codigo_estante, cod_coluna, cod_bandeja);
  END IF;
END $$;
