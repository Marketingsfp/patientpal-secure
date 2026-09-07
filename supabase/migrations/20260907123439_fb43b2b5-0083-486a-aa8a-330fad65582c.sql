CREATE OR REPLACE FUNCTION public.nina_teste_nao_lidas(_clinica_id uuid, _conversa_ids uuid[])
RETURNS TABLE(conversa_id uuid, nao_lidas integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT m.conversa_id, count(*)::int
    FROM public.whatsapp_mensagens m
    LEFT JOIN public.atend_leituras l
      ON l.conversa_id = m.conversa_id AND l.user_id = auth.uid()
   WHERE auth.uid() IS NOT NULL
     AND _clinica_id = ANY (public.clinicas_do_usuario())
     AND m.clinica_id = _clinica_id
     AND m.conversa_id = ANY (_conversa_ids)
     AND m.direction = 'out'
     AND coalesce(btrim(m.body), '') <> ''
     AND lower(coalesce(m.tipo, 'text')) NOT IN
       ('system','sistema','evento','auditoria','diagnostico','diagnóstico','trace','handoff','transferencia','transferência','sessao','sessão')
     AND lower(coalesce(m.enviada_por, 'nina')) IN ('nina','atendente','humano')
     AND (l.ultima_msg_lida_em IS NULL OR m.recebida_em > l.ultima_msg_lida_em)
   GROUP BY m.conversa_id;
$function$;

GRANT EXECUTE ON FUNCTION public.nina_teste_nao_lidas(uuid, uuid[]) TO authenticated;