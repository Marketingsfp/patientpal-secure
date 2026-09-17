-- O badge real passa a representar a leitura da equipe, não a do supervisor.
-- Sem apagar mensagens, zerar contadores legados ou inferir leitura histórica.
BEGIN;

CREATE OR REPLACE FUNCTION public.atend_permite_leitura_operacional(_clinica_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.clinica_memberships
      WHERE clinica_id = _clinica_id AND user_id = auth.uid() AND ativo)
    AND NOT EXISTS (SELECT 1 FROM public.clinica_memberships
      WHERE clinica_id = _clinica_id AND user_id = auth.uid() AND ativo
        AND role::text IN ('admin', 'gestor', 'supervisor'));
$$;
REVOKE ALL ON FUNCTION public.atend_permite_leitura_operacional(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atend_permite_leitura_operacional(uuid) TO authenticated;

-- Mesmo escopo operacional da Inbox: próprias abertas, Nina e histórico próprio.
-- Conhecer um UUID não concede acesso à fila privada de outra atendente.
CREATE OR REPLACE FUNCTION public.atend_pode_ver_leitura(_clinica_id uuid, _conversa_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_member(auth.uid(), _clinica_id)
    AND EXISTS (SELECT 1 FROM public.atend_conversas c
      WHERE c.id = _conversa_id AND c.clinica_id = _clinica_id
        AND (
          public.can_manage_clinica(auth.uid(), _clinica_id)
          OR (c.status NOT IN ('closed', 'finished') AND (
            (c.owner_type = 'AI' AND NOT c.fila_pendente)
            OR c.atribuida_user_id = auth.uid()))
          OR (c.status IN ('closed', 'finished') AND (
            c.last_assigned_user_id = auth.uid() OR c.resolved_by = auth.uid()
            OR (c.last_assigned_user_id IS NULL AND c.resolved_by IS NULL
              AND c.atribuida_user_id = auth.uid())))
        ));
$$;
REVOKE ALL ON FUNCTION public.atend_pode_ver_leitura(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atend_pode_ver_leitura(uuid, uuid) TO authenticated;

CREATE TABLE public.atend_leitura_operacional (
  conversa_id uuid PRIMARY KEY REFERENCES public.atend_conversas(id) ON DELETE CASCADE,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  ultima_msg_lida_id uuid NOT NULL,
  ultima_msg_lida_em timestamptz NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_atend_leitura_operacional_clinica ON public.atend_leitura_operacional(clinica_id);
ALTER TABLE public.atend_leitura_operacional ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atend_leitura_operacional FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.atend_leitura_operacional TO authenticated;
GRANT ALL ON public.atend_leitura_operacional TO service_role;
CREATE POLICY leitura_operacional_select ON public.atend_leitura_operacional
  FOR SELECT TO authenticated
  USING (public.atend_pode_ver_leitura(clinica_id, conversa_id));

CREATE OR REPLACE FUNCTION public.atend_registrar_leitura(
  _clinica_id uuid, _conversa_id uuid, _mensagem_id uuid DEFAULT NULL
)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _limite timestamptz;
  _msg uuid := _mensagem_id;
  _res timestamptz;
  _teste boolean;
BEGIN
  IF _uid IS NULL OR NOT public.is_member(_uid, _clinica_id) THEN
    RAISE EXCEPTION 'sem acesso a clinica' USING ERRCODE = '42501';
  END IF;
  -- Serializa com transferências; ler jamais altera a atribuição/status/fila.
  SELECT coalesce(c.is_teste, false) INTO _teste FROM public.atend_conversas c
    WHERE c.id = _conversa_id AND c.clinica_id = _clinica_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversa nao encontrada'; END IF;
  IF NOT _teste THEN
    IF NOT public.atend_permite_leitura_operacional(_clinica_id)
       OR NOT public.atend_pode_ver_leitura(_clinica_id, _conversa_id) THEN
      RAISE EXCEPTION 'perfil ou conversa sem permissao para registrar leitura' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF _msg IS NOT NULL THEN
    SELECT m.recebida_em INTO _limite FROM public.whatsapp_mensagens m
      WHERE m.id = _msg AND m.conversa_id = _conversa_id AND m.clinica_id = _clinica_id;
    IF _limite IS NULL THEN RAISE EXCEPTION 'mensagem nao pertence a conversa'; END IF;
  ELSE
    -- Compatibilidade com o console de testes. No atendimento real a tela
    -- precisa informar o limite efetivamente carregado, nunca "tudo até agora".
    IF NOT _teste THEN RAISE EXCEPTION 'informe a ultima mensagem visualizada'; END IF;
    SELECT m.id, m.recebida_em INTO _msg, _limite FROM public.whatsapp_mensagens m
      WHERE m.conversa_id = _conversa_id AND m.clinica_id = _clinica_id
      ORDER BY m.recebida_em DESC, m.id DESC LIMIT 1;
    IF _limite IS NULL THEN RETURN NULL; END IF;
  END IF;

  -- Mantém o histórico individual e o comportamento isolado da homologação.
  INSERT INTO public.atend_leituras
    (clinica_id, conversa_id, user_id, ultima_msg_lida_id, ultima_msg_lida_em, read_at)
  VALUES (_clinica_id, _conversa_id, _uid, _msg, _limite, now())
  ON CONFLICT (conversa_id, user_id) DO UPDATE
    SET ultima_msg_lida_id = EXCLUDED.ultima_msg_lida_id,
        ultima_msg_lida_em = EXCLUDED.ultima_msg_lida_em, read_at = now()
    WHERE (EXCLUDED.ultima_msg_lida_em, EXCLUDED.ultima_msg_lida_id) >
      (atend_leituras.ultima_msg_lida_em, coalesce(atend_leituras.ultima_msg_lida_id, '00000000-0000-0000-0000-000000000000'::uuid));

  IF _teste THEN
    SELECT ultima_msg_lida_em INTO _res FROM public.atend_leituras
      WHERE conversa_id = _conversa_id AND user_id = _uid;
    RETURN _res;
  END IF;

  INSERT INTO public.atend_leitura_operacional
    (clinica_id, conversa_id, user_id, ultima_msg_lida_id, ultima_msg_lida_em)
  VALUES (_clinica_id, _conversa_id, _uid, _msg, _limite)
  ON CONFLICT (conversa_id) DO UPDATE
    SET ultima_msg_lida_id = EXCLUDED.ultima_msg_lida_id,
        ultima_msg_lida_em = EXCLUDED.ultima_msg_lida_em,
        user_id = EXCLUDED.user_id, read_at = now()
    WHERE (EXCLUDED.ultima_msg_lida_em, EXCLUDED.ultima_msg_lida_id) >
      (atend_leitura_operacional.ultima_msg_lida_em, atend_leitura_operacional.ultima_msg_lida_id);
  SELECT ultima_msg_lida_em INTO _res FROM public.atend_leitura_operacional WHERE conversa_id = _conversa_id;
  RETURN _res;
END;
$$;
REVOKE ALL ON FUNCTION public.atend_registrar_leitura(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atend_registrar_leitura(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.atend_nao_lidas(_clinica_id uuid, _conversa_ids uuid[])
RETURNS TABLE (conversa_id uuid, nao_lidas integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, count(m.id)::integer
    FROM public.atend_conversas c
    LEFT JOIN public.atend_leitura_operacional l ON l.conversa_id = c.id AND l.clinica_id = c.clinica_id
    LEFT JOIN public.whatsapp_mensagens m
      ON m.conversa_id = c.id AND m.clinica_id = c.clinica_id AND m.direction = 'in'
      AND (l.conversa_id IS NULL OR (m.recebida_em, m.id) > (l.ultima_msg_lida_em, l.ultima_msg_lida_id))
    WHERE c.clinica_id = _clinica_id AND c.id = ANY(_conversa_ids)
      AND NOT coalesce(c.is_teste, false)
      AND public.atend_pode_ver_leitura(_clinica_id, c.id)
    GROUP BY c.id;
$$;
REVOKE ALL ON FUNCTION public.atend_nao_lidas(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atend_nao_lidas(uuid, uuid[]) TO authenticated;

-- Uma leitura operacional precisa atualizar o badge das outras sessões também.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'atend_leitura_operacional') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.atend_leitura_operacional;
  END IF;
END $$;
COMMIT;