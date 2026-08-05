ALTER TABLE public.cb_convenios
  ADD COLUMN IF NOT EXISTS taxa_inclusao_dependente numeric(10,2) NOT NULL DEFAULT 0;