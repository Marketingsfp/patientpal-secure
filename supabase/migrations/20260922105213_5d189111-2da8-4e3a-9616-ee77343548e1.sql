ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS preparos text[],
  ADD COLUMN IF NOT EXISTS preparo_observacoes text;