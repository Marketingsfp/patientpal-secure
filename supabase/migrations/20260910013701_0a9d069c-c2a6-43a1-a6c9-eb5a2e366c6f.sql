CREATE OR REPLACE FUNCTION public.nina_teste_garantir_ciclo(
  p_clinica_id uuid,
  p_lead_id uuid,
  p_user_id uuid
)
RETURNS TABLE (ciclo_id uuid, conversa_id uuid, criado boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.nina_teste_leads%ROWTYPE;
  v_ciclo_id uuid;
  v_conversa_id uuid;
  v_criado boolean := false;
BEGIN
  -- serializa por lead entre requisições concorrentes (mesma transação)
  PERFORM pg_advisory_xact_lock(hashtextextended(p_lead_id::text, 0));

  SELECT * INTO v_lead FROM public.nina_teste_leads
   WHERE id = p_lead_id AND clinica_id = p_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead de teste não encontrado';
  END IF;

  -- ciclo ativo já existente vence a corrida
  SELECT c.id, c.conversa_id INTO v_ciclo_id, v_conversa_id
    FROM public.nina_teste_ciclos c
   WHERE c.lead_id = p_lead_id AND c.status = 'ativo'
   ORDER BY c.started_at DESC
   LIMIT 1;

  IF v_ciclo_id IS NULL THEN
    INSERT INTO public.nina_teste_ciclos
      (clinica_id, lead_id, indice, sessao_seq, telefone_sessao, status, started_at, criado_por)
    VALUES
      (p_clinica_id, p_lead_id, v_lead.indice, v_lead.sessao_seq, v_lead.telefone_sessao,
       'ativo', now(), p_user_id)
    ON CONFLICT (lead_id) WHERE (status = 'ativo') DO NOTHING
    RETURNING id INTO v_ciclo_id;

    IF v_ciclo_id IS NULL THEN
      -- outra requisição venceu: reutiliza o ciclo vencedor
      SELECT c.id, c.conversa_id INTO v_ciclo_id, v_conversa_id
        FROM public.nina_teste_ciclos c
       WHERE c.lead_id = p_lead_id AND c.status = 'ativo'
       LIMIT 1;
    ELSE
      v_criado := true;
    END IF;
  END IF;

  IF v_conversa_id IS NULL THEN
    v_conversa_id := v_lead.conversa_id;
  END IF;

  IF v_conversa_id IS NULL THEN
    INSERT INTO public.atend_conversas
      (clinica_id, canal, contato_telefone, contato_nome, status, owner_type,
       ai_enabled, is_teste, teste_ciclo_id, ultima_msg_em)
    VALUES
      (p_clinica_id, 'test-console', v_lead.telefone_sessao, v_lead.nome, 'bot_attending', 'AI',
       true, true, v_ciclo_id, now())
    RETURNING id INTO v_conversa_id;
  ELSE
    UPDATE public.atend_conversas SET teste_ciclo_id = v_ciclo_id
     WHERE id = v_conversa_id AND teste_ciclo_id IS DISTINCT FROM v_ciclo_id;
  END IF;

  UPDATE public.nina_teste_ciclos
     SET conversa_id = v_conversa_id,
         nina_session_id = COALESCE(nina_session_id, 'nina_sess_' || v_ciclo_id::text),
         updated_at = now()
   WHERE id = v_ciclo_id;

  UPDATE public.nina_teste_leads
     SET conversa_id = v_conversa_id,
         ciclo_id = v_ciclo_id,
         ciclo_iniciado_em = COALESCE(ciclo_iniciado_em, now()),
         status = 'ativa'
   WHERE id = p_lead_id;

  RETURN QUERY SELECT v_ciclo_id, v_conversa_id, v_criado;
END;
$$;

REVOKE ALL ON FUNCTION public.nina_teste_garantir_ciclo(uuid, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.nina_teste_garantir_ciclo(uuid, uuid, uuid) TO service_role;
