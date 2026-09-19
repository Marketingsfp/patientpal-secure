-- 1) Uso de IA do Coach
CREATE TABLE IF NOT EXISTS public.coach_uso_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  atendente text,
  funcao text NOT NULL,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  custo_estimado numeric(12,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.coach_uso_ia TO authenticated;
GRANT ALL ON public.coach_uso_ia TO service_role;

ALTER TABLE public.coach_uso_ia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_uso_ia_select ON public.coach_uso_ia;
CREATE POLICY coach_uso_ia_select ON public.coach_uso_ia
  FOR SELECT TO authenticated
  USING (
    clinica_id = ANY (clinicas_do_usuario())
    AND (coach_pode_gerir(clinica_id) OR user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS coach_uso_ia_clinica_data ON public.coach_uso_ia (clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_uso_ia_clinica_user ON public.coach_uso_ia (clinica_id, user_id, created_at DESC);

-- 2) Configuração: limites de uso e retenção de áudio
ALTER TABLE public.coach_config_clinica
  ADD COLUMN IF NOT EXISTS limite_ia_usuario integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS limite_ia_clinica integer NOT NULL DEFAULT 600,
  ADD COLUMN IF NOT EXISTS reter_audio_dias integer NOT NULL DEFAULT 30;

-- 3) Feedback persistido da prova
ALTER TABLE public.coach_provas ADD COLUMN IF NOT EXISTS feedback jsonb;

-- 4) Índices das listas
CREATE INDEX IF NOT EXISTS coach_analises_clinica_data ON public.coach_analises (clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_analises_clinica_user ON public.coach_analises (clinica_id, user_id);
CREATE INDEX IF NOT EXISTS coach_provas_clinica_data ON public.coach_provas (clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_provas_clinica_user ON public.coach_provas (clinica_id, user_id);
CREATE INDEX IF NOT EXISTS coach_roleplay_clinica_data ON public.coach_roleplay_sessions (clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_roleplay_clinica_user ON public.coach_roleplay_sessions (clinica_id, user_id);
CREATE INDEX IF NOT EXISTS coach_tempo_clinica_user ON public.coach_tempo_estudo (clinica_id, user_id);
CREATE INDEX IF NOT EXISTS coach_eventos_clinica_data ON public.coach_eventos_seguranca (clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_metas_clinica_user ON public.coach_desempenho_metas (clinica_id, user_id);

-- 5) Registro de uso com limite diário
CREATE OR REPLACE FUNCTION public.coach_registrar_uso_ia(
  _clinica_id uuid,
  _funcao text,
  _tokens_in integer DEFAULT 0,
  _tokens_out integer DEFAULT 0,
  _custo numeric DEFAULT 0,
  _atendente text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_lim_user integer;
  v_lim_clin integer;
  v_qtd_user integer;
  v_qtd_clin integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre novamente.';
  END IF;
  IF NOT has_module_access(v_user, _clinica_id, 'coach', 'read') THEN
    RAISE EXCEPTION 'Sem acesso ao Coach nesta clínica.';
  END IF;

  SELECT COALESCE(limite_ia_usuario, 60), COALESCE(limite_ia_clinica, 600)
    INTO v_lim_user, v_lim_clin
    FROM coach_config_clinica WHERE clinica_id = _clinica_id;
  v_lim_user := COALESCE(v_lim_user, 60);
  v_lim_clin := COALESCE(v_lim_clin, 600);

  SELECT count(*) INTO v_qtd_user FROM coach_uso_ia
   WHERE clinica_id = _clinica_id AND user_id = v_user
     AND created_at >= (now() AT TIME ZONE 'America/Sao_Paulo')::date::timestamptz;
  IF v_lim_user > 0 AND v_qtd_user >= v_lim_user THEN
    RAISE EXCEPTION 'Você atingiu o limite de uso da IA do Coach por hoje. Tente amanhã ou fale com a gestão.';
  END IF;

  SELECT count(*) INTO v_qtd_clin FROM coach_uso_ia
   WHERE clinica_id = _clinica_id
     AND created_at >= (now() AT TIME ZONE 'America/Sao_Paulo')::date::timestamptz;
  IF v_lim_clin > 0 AND v_qtd_clin >= v_lim_clin THEN
    RAISE EXCEPTION 'A clínica atingiu o limite de uso da IA do Coach por hoje.';
  END IF;

  INSERT INTO coach_uso_ia (clinica_id, user_id, atendente, funcao, tokens_in, tokens_out, custo_estimado)
  VALUES (_clinica_id, v_user, _atendente, _funcao, COALESCE(_tokens_in,0), COALESCE(_tokens_out,0), COALESCE(_custo,0));
END;
$$;

REVOKE ALL ON FUNCTION public.coach_registrar_uso_ia(uuid, text, integer, integer, numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.coach_registrar_uso_ia(uuid, text, integer, integer, numeric, text) TO authenticated;

-- 6) Resumos agregados
CREATE OR REPLACE FUNCTION public.coach_resumo_atendentes(_clinica_id uuid, _desde timestamptz DEFAULT NULL)
RETURNS TABLE (
  user_id uuid,
  atendente text,
  roleplays integer,
  media_roleplay numeric,
  provas integer,
  media_prova numeric,
  segundos bigint,
  ultimo timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH permitido AS (
    SELECT has_module_access(auth.uid(), _clinica_id, 'coach', 'read') AS ok
  ),
  base AS (
    SELECT r.user_id, r.atendente,
           1 AS rp, r.nota AS nota_rp, 0 AS pv, NULL::numeric AS nota_pv,
           0::bigint AS seg, r.created_at
      FROM coach_roleplay_sessions r
     WHERE r.clinica_id = _clinica_id
       AND COALESCE(r.simulacao_gestor, false) = false
       AND (_desde IS NULL OR r.created_at >= _desde)
    UNION ALL
    SELECT p.user_id, p.atendente, 0, NULL, 1, p.nota, 0::bigint, p.created_at
      FROM coach_provas p
     WHERE p.clinica_id = _clinica_id
       AND COALESCE(p.simulacao_gestor, false) = false
       AND (_desde IS NULL OR p.created_at >= _desde)
    UNION ALL
    SELECT t.user_id, t.atendente, 0, NULL, 0, NULL, COALESCE(t.segundos,0)::bigint, t.created_at
      FROM coach_tempo_estudo t
     WHERE t.clinica_id = _clinica_id
       AND (_desde IS NULL OR t.created_at >= _desde)
  )
  SELECT b.user_id,
         max(b.atendente) AS atendente,
         sum(b.rp)::integer AS roleplays,
         round(avg(b.nota_rp)::numeric, 2) AS media_roleplay,
         sum(b.pv)::integer AS provas,
         round(avg(b.nota_pv)::numeric, 2) AS media_prova,
         sum(b.seg)::bigint AS segundos,
         max(b.created_at) AS ultimo
    FROM base b, permitido
   WHERE permitido.ok
   GROUP BY b.user_id;
$$;

REVOKE ALL ON FUNCTION public.coach_resumo_atendentes(uuid, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.coach_resumo_atendentes(uuid, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.coach_nomes_orfaos(_clinica_id uuid)
RETURNS TABLE (atendente text, roleplays integer, provas integer, tempos integer, ultimo timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH permitido AS (
    SELECT coach_pode_gerir(_clinica_id) AS ok
  ),
  base AS (
    SELECT atendente, 1 AS rp, 0 AS pv, 0 AS tp, created_at
      FROM coach_roleplay_sessions
     WHERE clinica_id = _clinica_id AND user_id IS NULL
    UNION ALL
    SELECT atendente, 0, 1, 0, created_at FROM coach_provas
     WHERE clinica_id = _clinica_id AND user_id IS NULL
    UNION ALL
    SELECT atendente, 0, 0, 1, created_at FROM coach_tempo_estudo
     WHERE clinica_id = _clinica_id AND user_id IS NULL
  )
  SELECT b.atendente,
         sum(b.rp)::integer, sum(b.pv)::integer, sum(b.tp)::integer, max(b.created_at)
    FROM base b, permitido
   WHERE permitido.ok AND COALESCE(btrim(b.atendente), '') <> ''
   GROUP BY b.atendente
   ORDER BY max(b.created_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.coach_nomes_orfaos(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.coach_nomes_orfaos(uuid) TO authenticated;

-- 7) Limpeza de eventos de proteção de tela com mais de 90 dias
CREATE OR REPLACE FUNCTION public.coach_limpar_eventos_antigos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_qtd integer;
BEGIN
  DELETE FROM coach_eventos_seguranca WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  RETURN v_qtd;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_limpar_eventos_antigos() FROM public;
GRANT EXECUTE ON FUNCTION public.coach_limpar_eventos_antigos() TO service_role;