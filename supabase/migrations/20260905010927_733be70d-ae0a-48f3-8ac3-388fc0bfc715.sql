-- FASE 2: revisão dos feedbacks de erro da Nina (sem alterar Base de Conhecimentos)

ALTER TABLE public.nina_feedback_erros
  ADD COLUMN IF NOT EXISTS correcao_original text,
  ADD COLUMN IF NOT EXISTS motivo_rejeicao text,
  ADD COLUMN IF NOT EXISTS revisado_por uuid,
  ADD COLUMN IF NOT EXISTS revisado_em timestamptz,
  ADD COLUMN IF NOT EXISTS unidade_id uuid;

UPDATE public.nina_feedback_erros SET correcao_original = correcao WHERE correcao_original IS NULL;

ALTER TABLE public.nina_feedback_erros DROP CONSTRAINT IF EXISTS nina_fb_status_chk;
ALTER TABLE public.nina_feedback_erros ADD CONSTRAINT nina_fb_status_chk
  CHECK (status IN ('pending','under_review','approved','rejected','applied','reverted'));

CREATE OR REPLACE FUNCTION public.nina_fb_pode_revisar(_user_id uuid, _clinica_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.user_id = _user_id
      AND m.clinica_id = _clinica_id
      AND m.role IN ('admin','gestor','supervisor')
  );
$$;

GRANT EXECUTE ON FUNCTION public.nina_fb_pode_revisar(uuid, uuid) TO authenticated;
GRANT UPDATE ON public.nina_feedback_erros TO authenticated;

DROP POLICY IF EXISTS nina_fb_update ON public.nina_feedback_erros;
CREATE POLICY nina_fb_update ON public.nina_feedback_erros FOR UPDATE TO authenticated
  USING (public.nina_fb_pode_revisar(auth.uid(), clinica_id))
  WITH CHECK (public.nina_fb_pode_revisar(auth.uid(), clinica_id));