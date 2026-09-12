ALTER TABLE public.atend_agente_presenca
  ADD COLUMN IF NOT EXISTS estado_manual text,
  ADD COLUMN IF NOT EXISTS estado_manual_em timestamptz,
  ADD COLUMN IF NOT EXISTS estado_manual_por uuid,
  ADD COLUMN IF NOT EXISTS estado_manual_versao integer NOT NULL DEFAULT 0;

ALTER TABLE public.atend_agente_presenca
  ADD CONSTRAINT atend_agente_presenca_estado_manual_chk
  CHECK (estado_manual IS NULL OR estado_manual IN ('ONLINE','OFFLINE','PAUSA'));

CREATE TABLE IF NOT EXISTS public.atend_presenca_manual_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  user_id uuid NOT NULL,
  estado text NOT NULL CHECK (estado IN ('ONLINE','OFFLINE','PAUSA')),
  versao integer NOT NULL DEFAULT 0,
  definido_por uuid NOT NULL,
  origem text NOT NULL DEFAULT 'controle_presenca',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atend_presenca_manual_log_idx
  ON public.atend_presenca_manual_log (clinica_id, user_id, created_at DESC);

GRANT SELECT, INSERT ON public.atend_presenca_manual_log TO authenticated;
GRANT ALL ON public.atend_presenca_manual_log TO service_role;

ALTER TABLE public.atend_presenca_manual_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "presenca manual log: proprio atendente insere"
  ON public.atend_presenca_manual_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND definido_por = auth.uid());

CREATE POLICY "presenca manual log: leitura propria ou gestao"
  ON public.atend_presenca_manual_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.atend_usuario_e_admin(auth.uid(), clinica_id));