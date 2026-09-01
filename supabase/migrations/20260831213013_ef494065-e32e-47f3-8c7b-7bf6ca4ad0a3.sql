CREATE TABLE IF NOT EXISTS public.campanhas_marketing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'whatsapp',
  mensagem text NOT NULL,
  segmento text,
  agendada_para timestamptz,
  enviada_em timestamptz,
  status text NOT NULL DEFAULT 'rascunho',
  total_envios integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanhas_marketing TO authenticated;
GRANT ALL ON public.campanhas_marketing TO service_role;

ALTER TABLE public.campanhas_marketing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cm_select ON public.campanhas_marketing;
DROP POLICY IF EXISTS cm_insert ON public.campanhas_marketing;
DROP POLICY IF EXISTS cm_update ON public.campanhas_marketing;
DROP POLICY IF EXISTS cm_delete ON public.campanhas_marketing;

CREATE POLICY cm_select ON public.campanhas_marketing FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY cm_insert ON public.campanhas_marketing FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY cm_update ON public.campanhas_marketing FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id)) WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY cm_delete ON public.campanhas_marketing FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));

CREATE INDEX IF NOT EXISTS idx_campanhas_marketing_clinica ON public.campanhas_marketing (clinica_id, created_at DESC);

DROP TRIGGER IF EXISTS cm_touch ON public.campanhas_marketing;
CREATE TRIGGER cm_touch BEFORE UPDATE ON public.campanhas_marketing FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mkt_envios_campanha_id_fkey'
  ) THEN
    ALTER TABLE public.mkt_envios
      ADD CONSTRAINT mkt_envios_campanha_id_fkey
      FOREIGN KEY (campanha_id) REFERENCES public.campanhas_marketing(id) ON DELETE SET NULL;
  END IF;
END $$;