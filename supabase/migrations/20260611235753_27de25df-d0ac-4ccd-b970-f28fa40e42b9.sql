ALTER TABLE public.contratos_assinatura
  ADD COLUMN IF NOT EXISTS tabela_legada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS migrar_apos date;