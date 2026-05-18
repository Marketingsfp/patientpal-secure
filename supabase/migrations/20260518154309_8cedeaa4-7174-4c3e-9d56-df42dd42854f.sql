ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS bandeira_cartao text,
  ADD COLUMN IF NOT EXISTS parcelas integer,
  ADD COLUMN IF NOT EXISTS emitir_nfse boolean NOT NULL DEFAULT false;