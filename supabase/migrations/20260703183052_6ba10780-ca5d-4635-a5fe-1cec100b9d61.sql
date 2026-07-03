ALTER TABLE public.cb_convenio_regras
  ADD COLUMN IF NOT EXISTS carencia_mensalidades integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gratuito boolean NOT NULL DEFAULT false;