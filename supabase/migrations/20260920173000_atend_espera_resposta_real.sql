-- Avisos de encaminhamento e registros internos não respondem ao paciente.
-- Mesma assinatura/RLS: corrige apenas a leitura usada pela Central, pelos
-- cards e pela ordenação de espera; não reescreve conversas nem mensagens.
CREATE OR REPLACE FUNCTION public.atend_espera_por_conversa(
  _clinica_id uuid,
  _is_teste boolean DEFAULT false
)
RETURNS TABLE (conversa_id uuid, aguardando_desde timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH conversas AS (
    SELECT c.id, c.clinica_id,
      coalesce(c.owner_type, 'NONE') <> 'AI' AS atendimento_humano,
      CASE WHEN coalesce(c.owner_type, 'NONE') <> 'AI'
        THEN coalesce(c.handoff_em, c.aguardando_desde)
      END AS inicio_humano
    FROM public.atend_conversas c
    WHERE c.clinica_id = _clinica_id
      AND coalesce(c.is_teste, false) = _is_teste
      AND coalesce(c.status, '') NOT IN ('closed', 'finished')
  ), movimentos AS (
    SELECT w.conversa_id, coalesce(w.recebida_em, w.created_at) AS instante,
      w.direction = 'in' AS entrada,
      w.direction = 'out'
        AND w.status IN ('sent', 'delivered', 'read')
        AND (w.enviada_por = 'humano'
          OR (NOT c.atendimento_humano AND w.enviada_por = 'nina')) AS resposta
    FROM public.whatsapp_mensagens w
    JOIN conversas c ON c.id = w.conversa_id AND c.clinica_id = w.clinica_id
    WHERE coalesce(w.recebida_em, w.created_at) > now() - interval '7 days'
      AND (c.inicio_humano IS NULL
        OR coalesce(w.recebida_em, w.created_at) >= c.inicio_humano)
      AND coalesce(w.status, '') <> 'system'

    UNION ALL

    -- A transferência abre uma espera mesmo sem nova entrada após o aviso.
    -- O handoff atual também impede herdar a resposta de um ciclo anterior.
    SELECT c.id, c.inicio_humano, true, false
    FROM conversas c
    WHERE c.inicio_humano > now() - interval '7 days'
  ), com_resposta AS (
    SELECT m.*, max(m.instante) FILTER (WHERE m.resposta)
      OVER (PARTITION BY m.conversa_id) AS ultima_resposta
    FROM movimentos m
  )
  SELECT m.conversa_id, min(m.instante) AS aguardando_desde
  FROM com_resposta m
  WHERE m.entrada AND (m.ultima_resposta IS NULL OR m.instante > m.ultima_resposta)
  GROUP BY m.conversa_id;
$$;

-- CREATE OR REPLACE preserva os privilégios da função existente.
-- Rollback: restaurar apenas a função da migration 20260904221502, sem DML.
