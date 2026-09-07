CREATE OR REPLACE FUNCTION public.nina_teste_resumo_leads(_clinica_id uuid, _conversa_ids uuid[])
RETURNS TABLE(
  conversa_id uuid,
  total_mensagens integer,
  nao_lidas integer,
  ultima_msg_id uuid,
  ultima_msg_body text,
  ultima_msg_autor text,
  ultima_msg_em timestamptz,
  ultima_atividade_em timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH permitido AS (
    SELECT 1 WHERE auth.uid() IS NOT NULL AND _clinica_id = ANY (public.clinicas_do_usuario())
  ),
  msgs AS (
    SELECT m.id, m.conversa_id, m.body, m.created_at, m.recebida_em, m.direction,
           lower(coalesce(m.enviada_por, CASE WHEN m.direction = 'in' THEN 'paciente' ELSE 'nina' END)) AS autor,
           lower(coalesce(m.tipo, 'text')) AS tipo
      FROM public.whatsapp_mensagens m, permitido
     WHERE m.clinica_id = _clinica_id
       AND m.conversa_id = ANY (_conversa_ids)
  ),
  conversa AS (
    SELECT * FROM msgs
     WHERE coalesce(btrim(body), '') <> ''
       AND tipo NOT IN ('system','sistema','evento','auditoria','diagnostico','diagnóstico','trace','handoff','transferencia','transferência','sessao','sessão')
       AND autor IN ('paciente','nina','atendente','humano')
  ),
  ultima AS (
    SELECT DISTINCT ON (c.conversa_id) c.conversa_id, c.id, c.body, c.autor, c.created_at
      FROM conversa c
     ORDER BY c.conversa_id, c.created_at DESC, c.id DESC
  ),
  totais AS (
    SELECT m.conversa_id, count(*)::int AS total FROM msgs m GROUP BY m.conversa_id
  ),
  nlidas AS (
    SELECT c.conversa_id, count(*)::int AS nao_lidas
      FROM conversa c
      LEFT JOIN public.atend_leituras l
        ON l.conversa_id = c.conversa_id AND l.user_id = auth.uid()
     WHERE c.autor IN ('nina','atendente','humano')
       AND (l.ultima_msg_lida_em IS NULL OR coalesce(c.recebida_em, c.created_at) > l.ultima_msg_lida_em)
     GROUP BY c.conversa_id
  )
  SELECT cid.conversa_id,
         coalesce(t.total, 0),
         coalesce(n.nao_lidas, 0),
         u.id,
         u.body,
         CASE WHEN u.autor = 'humano' THEN 'atendente' ELSE u.autor END,
         u.created_at,
         u.created_at
    FROM (SELECT DISTINCT unnest(_conversa_ids) AS conversa_id) cid
    LEFT JOIN totais t ON t.conversa_id = cid.conversa_id
    LEFT JOIN nlidas n ON n.conversa_id = cid.conversa_id
    LEFT JOIN ultima u ON u.conversa_id = cid.conversa_id
   WHERE EXISTS (SELECT 1 FROM permitido);
$function$;

REVOKE ALL ON FUNCTION public.nina_teste_resumo_leads(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nina_teste_resumo_leads(uuid, uuid[]) TO authenticated;