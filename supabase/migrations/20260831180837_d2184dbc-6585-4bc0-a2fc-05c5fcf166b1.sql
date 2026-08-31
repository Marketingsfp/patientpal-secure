-- 1) Ownership e handoff em atend_conversas
ALTER TABLE public.atend_conversas
  ADD COLUMN IF NOT EXISTS owner_type text NOT NULL DEFAULT 'AI',
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS handoff_motivo text,
  ADD COLUMN IF NOT EXISTS handoff_resumo jsonb,
  ADD COLUMN IF NOT EXISTS handoff_em timestamptz,
  ADD COLUMN IF NOT EXISTS ai_tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prioridade integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.atend_conversas
    ADD CONSTRAINT atend_conversas_owner_type_chk CHECK (owner_type IN ('AI','HUMAN','NONE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Conversas já atribuídas a alguém passam a ser de responsabilidade humana.
UPDATE public.atend_conversas
   SET owner_type = 'HUMAN', ai_enabled = false
 WHERE atribuida_user_id IS NOT NULL AND owner_type = 'AI';

CREATE INDEX IF NOT EXISTS idx_atend_conversas_fila
  ON public.atend_conversas (clinica_id, owner_type, aguardando_desde);

-- 2) Eventos da conversa (auditoria do fluxo)
CREATE TABLE IF NOT EXISTS public.atend_conversa_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  conversa_id uuid NOT NULL REFERENCES public.atend_conversas(id) ON DELETE CASCADE,
  evento text NOT NULL,
  user_id uuid,
  departamento_id uuid,
  motivo text,
  detalhes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.atend_conversa_eventos TO authenticated;
GRANT ALL ON public.atend_conversa_eventos TO service_role;
ALTER TABLE public.atend_conversa_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eventos: membros leem"
  ON public.atend_conversa_eventos FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY "eventos: membros inserem"
  ON public.atend_conversa_eventos FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), clinica_id));
CREATE INDEX IF NOT EXISTS idx_atend_conversa_eventos_conversa
  ON public.atend_conversa_eventos (conversa_id, created_at DESC);

-- 3) Presença do atendente
CREATE TABLE IF NOT EXISTS public.atend_agente_presenca (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'OFFLINE',
  aceita_novas boolean NOT NULL DEFAULT true,
  visto_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, user_id),
  CONSTRAINT atend_agente_presenca_status_chk CHECK (status IN ('ONLINE','BUSY','AWAY','OFFLINE'))
);
GRANT SELECT, INSERT, UPDATE ON public.atend_agente_presenca TO authenticated;
GRANT ALL ON public.atend_agente_presenca TO service_role;
ALTER TABLE public.atend_agente_presenca ENABLE ROW LEVEL SECURITY;
CREATE POLICY "presenca: membros leem"
  ON public.atend_agente_presenca FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY "presenca: cada um cria a sua"
  ON public.atend_agente_presenca FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_member(auth.uid(), clinica_id));
CREATE POLICY "presenca: cada um atualiza a sua"
  ON public.atend_agente_presenca FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_member(auth.uid(), clinica_id))
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_atend_agente_presenca_updated
  BEFORE UPDATE ON public.atend_agente_presenca
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- 4) Assumir conversa de forma atômica
CREATE OR REPLACE FUNCTION public.atend_claim_conversa(_conversa_id uuid, _clinica_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ok boolean;
BEGIN
  IF NOT public.is_member(_user_id, _clinica_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta clínica';
  END IF;

  UPDATE public.atend_conversas
     SET atribuida_user_id = _user_id,
         owner_type = 'HUMAN',
         ai_enabled = false,
         status = 'active',
         assigned_at = now(),
         updated_at = now()
   WHERE id = _conversa_id
     AND clinica_id = _clinica_id
     AND atribuida_user_id IS NULL
     AND owner_type <> 'HUMAN'
  RETURNING true INTO _ok;

  RETURN COALESCE(_ok, false);
END;
$$;
REVOKE ALL ON FUNCTION public.atend_claim_conversa(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atend_claim_conversa(uuid, uuid, uuid) TO authenticated, service_role;