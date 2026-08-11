CREATE TABLE IF NOT EXISTS public.mkt_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  campanha_id uuid,
  canal text NOT NULL DEFAULT 'whatsapp',
  destinatario text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  erro text,
  enviado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mkt_envios_clinica ON public.mkt_envios (clinica_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_envios TO authenticated;
GRANT ALL ON public.mkt_envios TO service_role;

ALTER TABLE public.mkt_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros gerenciam envios" ON public.mkt_envios
  FOR ALL TO authenticated
  USING (is_member(auth.uid(), clinica_id))
  WITH CHECK (is_member(auth.uid(), clinica_id));

CREATE TRIGGER trg_mkt_envios_updated_at
  BEFORE UPDATE ON public.mkt_envios
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();