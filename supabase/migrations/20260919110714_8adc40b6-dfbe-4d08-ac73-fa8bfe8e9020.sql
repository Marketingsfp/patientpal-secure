DROP FUNCTION IF EXISTS public.coach_nomes_orfaos(uuid);

CREATE OR REPLACE FUNCTION public.coach_nomes_orfaos(_clinica_id uuid)
RETURNS TABLE (atendente text, analises integer, treinos integer, provas integer, total integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH permitido AS (SELECT coach_pode_gerir(_clinica_id) AS ok),
  linhas AS (
    SELECT atendente, user_id, 'analise'::text AS origem FROM coach_analises WHERE clinica_id = _clinica_id
    UNION ALL
    SELECT atendente, user_id, 'treino' FROM coach_roleplay_sessions WHERE clinica_id = _clinica_id
    UNION ALL
    SELECT atendente, user_id, 'prova' FROM coach_provas WHERE clinica_id = _clinica_id
    UNION ALL
    SELECT atendente, user_id, 'outro' FROM coach_tempo_estudo WHERE clinica_id = _clinica_id
    UNION ALL
    SELECT atendente, user_id, 'outro' FROM coach_eventos_seguranca WHERE clinica_id = _clinica_id
    UNION ALL
    SELECT atendente, user_id, 'outro' FROM coach_desempenho_metas WHERE clinica_id = _clinica_id
  ),
  com_usuario AS (
    SELECT DISTINCT btrim(atendente) AS nome FROM linhas WHERE user_id IS NOT NULL
  )
  SELECT btrim(l.atendente) AS atendente,
         count(*) FILTER (WHERE l.origem = 'analise')::integer AS analises,
         count(*) FILTER (WHERE l.origem = 'treino')::integer AS treinos,
         count(*) FILTER (WHERE l.origem = 'prova')::integer AS provas,
         count(*)::integer AS total
    FROM linhas l, permitido
   WHERE permitido.ok
     AND l.user_id IS NULL
     AND COALESCE(btrim(l.atendente), '') <> ''
     AND btrim(l.atendente) NOT IN (SELECT nome FROM com_usuario)
   GROUP BY btrim(l.atendente)
   ORDER BY count(*) DESC, btrim(l.atendente);
$$;

REVOKE ALL ON FUNCTION public.coach_nomes_orfaos(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.coach_nomes_orfaos(uuid) TO authenticated;