CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  metodo text NOT NULL,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  assinatura text,
  corpo text,
  resultado text
);

CREATE INDEX IF NOT EXISTS idx_wa_webhook_logs_clinica_data
  ON public.whatsapp_webhook_logs (clinica_id, recebido_em DESC);

GRANT ALL ON public.whatsapp_webhook_logs TO service_role;
GRANT SELECT ON public.whatsapp_webhook_logs TO authenticated;

ALTER TABLE public.whatsapp_webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_webhook_logs_manager_select" ON public.whatsapp_webhook_logs;
CREATE POLICY "wa_webhook_logs_manager_select"
  ON public.whatsapp_webhook_logs FOR SELECT TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));