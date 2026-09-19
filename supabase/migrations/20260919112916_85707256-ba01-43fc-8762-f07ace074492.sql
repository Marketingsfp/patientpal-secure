-- 1) Situação das provas e treinos
ALTER TABLE public.coach_provas
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'concluida',
  ADD COLUMN IF NOT EXISTS finalizada_at timestamptz;

ALTER TABLE public.coach_roleplay_sessions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'concluida',
  ADD COLUMN IF NOT EXISTS finalizada_at timestamptz;

CREATE INDEX IF NOT EXISTS coach_provas_status_idx
  ON public.coach_provas (clinica_id, user_id, status);
CREATE INDEX IF NOT EXISTS coach_roleplay_status_idx
  ON public.coach_roleplay_sessions (clinica_id, user_id, status);

-- 2) O navegador não escreve mais nessas tabelas: só as funções do servidor.
DROP POLICY IF EXISTS coach_provas_insert ON public.coach_provas;
DROP POLICY IF EXISTS coach_roleplay_insert ON public.coach_roleplay_sessions;
DROP POLICY IF EXISTS coach_roleplay_update ON public.coach_roleplay_sessions;

-- 3) Prova em andamento não pode ser lida pelo navegador (esconde o gabarito).
DROP POLICY IF EXISTS coach_provas_select ON public.coach_provas;
CREATE POLICY coach_provas_select ON public.coach_provas
  FOR SELECT TO authenticated
  USING (
    clinica_id = ANY (clinicas_do_usuario())
    AND status <> 'em_andamento'
    AND (coach_pode_gerir(clinica_id) OR user_id = auth.uid())
  );

-- 4) Treinos abandonados: encerrados sem nota depois de 2 horas.
CREATE OR REPLACE FUNCTION public.coach_expirar_treinos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  qtd integer;
BEGIN
  UPDATE public.coach_roleplay_sessions
     SET status = 'expirada',
         nota = NULL,
         finalizada_at = now()
   WHERE status = 'em_andamento'
     AND created_at < now() - interval '2 hours';
  GET DIAGNOSTICS qtd = ROW_COUNT;
  RETURN qtd;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_expirar_treinos() FROM public;
GRANT EXECUTE ON FUNCTION public.coach_expirar_treinos() TO service_role;