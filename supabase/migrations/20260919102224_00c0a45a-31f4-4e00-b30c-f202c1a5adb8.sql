-- 1) Permissão de gestor do Coach alinhada com a tela (has_module_access)
CREATE OR REPLACE FUNCTION public.coach_pode_gerir(_clinica_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.has_module_access(auth.uid(), _clinica_id, 'coach', 'write')
$function$;

-- 2) Tempo de estudo: SECURITY DEFINER + validação de identidade
CREATE OR REPLACE FUNCTION public.coach_registrar_tempo_estudo(_clinica_id uuid, _atendente text, _atividade text, _segundos integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _nome_perfil text;
  _gestor boolean;
BEGIN
  IF auth.uid() IS NULL OR _clinica_id IS NULL OR _atendente IS NULL OR btrim(_atendente) = '' THEN
    RETURN;
  END IF;
  IF _segundos IS NULL OR _segundos <= 0 OR _segundos > 3600 THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.user_id = auth.uid() AND m.clinica_id = _clinica_id AND m.ativo = true
  ) THEN
    RETURN;
  END IF;

  SELECT btrim(p.nome) INTO _nome_perfil FROM public.profiles p WHERE p.id = auth.uid();
  _gestor := public.coach_pode_gerir(_clinica_id);

  IF NOT _gestor AND lower(coalesce(_nome_perfil, '')) <> lower(btrim(_atendente)) THEN
    RETURN;
  END IF;

  INSERT INTO public.coach_tempo_estudo (clinica_id, user_id, atendente, atividade, dia, segundos)
  VALUES (_clinica_id, auth.uid(), btrim(_atendente), _atividade,
          (now() AT TIME ZONE 'America/Sao_Paulo')::date, _segundos)
  ON CONFLICT (clinica_id, atendente, atividade, dia)
  DO UPDATE SET segundos = public.coach_tempo_estudo.segundos + EXCLUDED.segundos,
                user_id = COALESCE(public.coach_tempo_estudo.user_id, EXCLUDED.user_id),
                updated_at = now();
END;
$function$;

-- 3) Eventos de segurança: só para o próprio usuário
DROP POLICY IF EXISTS coach_eventos_insert ON public.coach_eventos_seguranca;
CREATE POLICY coach_eventos_insert ON public.coach_eventos_seguranca
  FOR INSERT TO authenticated
  WITH CHECK (clinica_id = ANY (public.clinicas_do_usuario()) AND user_id = auth.uid());

-- 4) Marcação de simulação feita pelo gestor
ALTER TABLE public.coach_roleplay_sessions
  ADD COLUMN IF NOT EXISTS simulacao_gestor boolean NOT NULL DEFAULT false;
ALTER TABLE public.coach_provas
  ADD COLUMN IF NOT EXISTS simulacao_gestor boolean NOT NULL DEFAULT false;

-- 5) Variedade das simulações (antes em localStorage)
CREATE TABLE IF NOT EXISTS public.coach_variedade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  atendente text NOT NULL DEFAULT '',
  tipo text NOT NULL,
  valor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_variedade TO authenticated;
GRANT ALL ON public.coach_variedade TO service_role;

ALTER TABLE public.coach_variedade ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS coach_variedade_busca
  ON public.coach_variedade (clinica_id, user_id, tipo, created_at DESC);

DROP POLICY IF EXISTS coach_variedade_select ON public.coach_variedade;
CREATE POLICY coach_variedade_select ON public.coach_variedade
  FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario())
         AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()));

DROP POLICY IF EXISTS coach_variedade_insert ON public.coach_variedade;
CREATE POLICY coach_variedade_insert ON public.coach_variedade
  FOR INSERT TO authenticated
  WITH CHECK (clinica_id = ANY (public.clinicas_do_usuario()) AND user_id = auth.uid());

DROP POLICY IF EXISTS coach_variedade_delete ON public.coach_variedade;
CREATE POLICY coach_variedade_delete ON public.coach_variedade
  FOR DELETE TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario())
         AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()));

DROP TRIGGER IF EXISTS coach_variedade_touch ON public.coach_variedade;
CREATE TRIGGER coach_variedade_touch
  BEFORE UPDATE ON public.coach_variedade
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();