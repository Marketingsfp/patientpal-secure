CREATE TABLE IF NOT EXISTS public.nina_trace_retencao (
  clinica_id uuid PRIMARY KEY,
  dias integer NOT NULL DEFAULT 30 CHECK (dias BETWEEN 7 AND 365),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_por uuid
);

COMMENT ON TABLE public.nina_trace_retencao IS
  'Politica de retencao dos eventos tecnicos de tracing da Nina (nina_trace_eventos). Nao afeta dados operacionais, metricas ou auditoria.';

GRANT SELECT, INSERT, UPDATE ON public.nina_trace_retencao TO authenticated;
GRANT ALL ON public.nina_trace_retencao TO service_role;

ALTER TABLE public.nina_trace_retencao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nina_trace_retencao_admin_select" ON public.nina_trace_retencao;
CREATE POLICY "nina_trace_retencao_admin_select"
  ON public.nina_trace_retencao FOR SELECT TO authenticated
  USING (public.has_role(_user_id => auth.uid(), _role => 'admin'::public.app_role, _clinica_id => clinica_id));

DROP POLICY IF EXISTS "nina_trace_retencao_admin_insert" ON public.nina_trace_retencao;
CREATE POLICY "nina_trace_retencao_admin_insert"
  ON public.nina_trace_retencao FOR INSERT TO authenticated
  WITH CHECK (public.has_role(_user_id => auth.uid(), _role => 'admin'::public.app_role, _clinica_id => clinica_id));

DROP POLICY IF EXISTS "nina_trace_retencao_admin_update" ON public.nina_trace_retencao;
CREATE POLICY "nina_trace_retencao_admin_update"
  ON public.nina_trace_retencao FOR UPDATE TO authenticated
  USING (public.has_role(_user_id => auth.uid(), _role => 'admin'::public.app_role, _clinica_id => clinica_id))
  WITH CHECK (public.has_role(_user_id => auth.uid(), _role => 'admin'::public.app_role, _clinica_id => clinica_id));

CREATE OR REPLACE FUNCTION public.nina_trace_purgar(_clinica_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removidos integer := 0;
BEGIN
  WITH alvo AS (
    SELECT e.id
    FROM public.nina_trace_eventos e
    LEFT JOIN public.nina_trace_retencao r ON r.clinica_id = e.clinica_id
    WHERE (_clinica_id IS NULL OR e.clinica_id = _clinica_id)
      AND e.created_at < now() - (COALESCE(r.dias, 30) || ' days')::interval
    LIMIT 20000
  ), del AS (
    DELETE FROM public.nina_trace_eventos t USING alvo WHERE t.id = alvo.id RETURNING 1
  )
  SELECT count(*) INTO removidos FROM del;
  RETURN removidos;
END;
$$;

REVOKE ALL ON FUNCTION public.nina_trace_purgar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nina_trace_purgar(uuid) TO service_role;