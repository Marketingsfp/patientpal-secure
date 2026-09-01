ALTER TABLE public.atend_conversas DROP CONSTRAINT IF EXISTS atend_conversas_canal_check;
ALTER TABLE public.atend_conversas ADD CONSTRAINT atend_conversas_canal_check
  CHECK (canal = ANY (ARRAY['whatsapp'::text,'instagram'::text,'facebook'::text,'webchat'::text,'test-console'::text]));

ALTER TABLE public.atend_conversas ADD COLUMN IF NOT EXISTS is_teste boolean NOT NULL DEFAULT false;
ALTER TABLE public.whatsapp_mensagens ADD COLUMN IF NOT EXISTS is_teste boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_atend_conversas_teste ON public.atend_conversas (clinica_id, is_teste);
CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_teste ON public.whatsapp_mensagens (clinica_id, is_teste);

CREATE TABLE IF NOT EXISTS public.nina_teste_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  indice int NOT NULL,
  nome text NOT NULL,
  telefone_base text NOT NULL,
  sessao_seq int NOT NULL DEFAULT 1,
  telefone_sessao text NOT NULL,
  conversa_id uuid,
  status text NOT NULL DEFAULT 'ativa',
  environment text NOT NULL DEFAULT 'homologation',
  source_channel text NOT NULL DEFAULT 'test-console',
  is_test boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_teste_leads_status_chk CHECK (status = ANY (ARRAY['ativa'::text,'resolvida'::text])),
  CONSTRAINT nina_teste_leads_unq UNIQUE (clinica_id, indice)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nina_teste_leads TO authenticated;
GRANT ALL ON public.nina_teste_leads TO service_role;

ALTER TABLE public.nina_teste_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nina_teste_leads_select" ON public.nina_teste_leads
  FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "nina_teste_leads_cud" ON public.nina_teste_leads
  FOR ALL TO authenticated USING (is_member(auth.uid(), clinica_id))
  WITH CHECK (is_member(auth.uid(), clinica_id));

CREATE TRIGGER trg_nina_teste_leads_updated
  BEFORE UPDATE ON public.nina_teste_leads
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();