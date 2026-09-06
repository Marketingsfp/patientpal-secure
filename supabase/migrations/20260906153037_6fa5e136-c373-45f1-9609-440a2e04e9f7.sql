CREATE TABLE IF NOT EXISTS public.atend_leituras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  conversa_id uuid NOT NULL REFERENCES public.atend_conversas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  ultima_msg_lida_id uuid,
  ultima_msg_lida_em timestamptz NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversa_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_atend_leituras_user ON public.atend_leituras (user_id, clinica_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_leituras TO authenticated;
GRANT ALL ON public.atend_leituras TO service_role;

ALTER TABLE public.atend_leituras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leitura_propria_select" ON public.atend_leituras
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND clinica_id = ANY (public.clinicas_do_usuario()));

CREATE POLICY "leitura_propria_insert" ON public.atend_leituras
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND clinica_id = ANY (public.clinicas_do_usuario()));

CREATE POLICY "leitura_propria_update" ON public.atend_leituras
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND clinica_id = ANY (public.clinicas_do_usuario()))
  WITH CHECK (user_id = auth.uid() AND clinica_id = ANY (public.clinicas_do_usuario()));

CREATE POLICY "leitura_propria_delete" ON public.atend_leituras
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND clinica_id = ANY (public.clinicas_do_usuario()));

CREATE TRIGGER trg_atend_leituras_updated_at
  BEFORE UPDATE ON public.atend_leituras
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- Registra a leitura do PRÓPRIO usuário autenticado, até uma mensagem real da
-- timeline. O marcador só avança: chamada atrasada nunca faz retroceder.
CREATE OR REPLACE FUNCTION public.atend_registrar_leitura(
  _clinica_id uuid,
  _conversa_id uuid,
  _mensagem_id uuid DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _limite timestamptz;
  _msg uuid := _mensagem_id;
  _res timestamptz;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'nao autenticado';
  END IF;
  IF NOT (_clinica_id = ANY (public.clinicas_do_usuario())) THEN
    RAISE EXCEPTION 'sem acesso a clinica';
  END IF;
  PERFORM 1 FROM public.atend_conversas c
    WHERE c.id = _conversa_id AND c.clinica_id = _clinica_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversa nao encontrada';
  END IF;

  IF _msg IS NOT NULL THEN
    SELECT m.recebida_em INTO _limite
      FROM public.whatsapp_mensagens m
     WHERE m.id = _msg AND m.conversa_id = _conversa_id AND m.clinica_id = _clinica_id;
    IF _limite IS NULL THEN
      RAISE EXCEPTION 'mensagem nao pertence a conversa';
    END IF;
  ELSE
    SELECT m.id, m.recebida_em INTO _msg, _limite
      FROM public.whatsapp_mensagens m
     WHERE m.conversa_id = _conversa_id AND m.clinica_id = _clinica_id
     ORDER BY m.recebida_em DESC, m.id DESC
     LIMIT 1;
    IF _limite IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.atend_leituras
    (clinica_id, conversa_id, user_id, ultima_msg_lida_id, ultima_msg_lida_em, read_at)
  VALUES (_clinica_id, _conversa_id, _uid, _msg, _limite, now())
  ON CONFLICT (conversa_id, user_id) DO UPDATE
    SET ultima_msg_lida_id = EXCLUDED.ultima_msg_lida_id,
        ultima_msg_lida_em = EXCLUDED.ultima_msg_lida_em,
        read_at = now()
    WHERE EXCLUDED.ultima_msg_lida_em > public.atend_leituras.ultima_msg_lida_em;

  SELECT l.ultima_msg_lida_em INTO _res
    FROM public.atend_leituras l
   WHERE l.conversa_id = _conversa_id AND l.user_id = _uid;
  RETURN _res;
END;
$$;

REVOKE ALL ON FUNCTION public.atend_registrar_leitura(uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.atend_registrar_leitura(uuid, uuid, uuid) TO authenticated;

-- Não lidas DESTE usuário: mensagens recebidas do paciente após o marcador.
-- Sem marcador conhecido, conta todas as recebidas (o contador global antigo
-- não prova leitura de ninguém e é mantido apenas como referência histórica).
CREATE OR REPLACE FUNCTION public.atend_nao_lidas(
  _clinica_id uuid,
  _conversa_ids uuid[]
)
RETURNS TABLE (conversa_id uuid, nao_lidas integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.conversa_id, count(*)::int
    FROM public.whatsapp_mensagens m
    LEFT JOIN public.atend_leituras l
      ON l.conversa_id = m.conversa_id AND l.user_id = auth.uid()
   WHERE auth.uid() IS NOT NULL
     AND _clinica_id = ANY (public.clinicas_do_usuario())
     AND m.clinica_id = _clinica_id
     AND m.conversa_id = ANY (_conversa_ids)
     AND m.direction = 'in'
     AND (l.ultima_msg_lida_em IS NULL OR m.recebida_em > l.ultima_msg_lida_em)
   GROUP BY m.conversa_id;
$$;

REVOKE ALL ON FUNCTION public.atend_nao_lidas(uuid, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.atend_nao_lidas(uuid, uuid[]) TO authenticated;