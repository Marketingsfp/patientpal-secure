-- 1) Normaliza a criação/busca de conversas: sempre apenas dígitos
CREATE OR REPLACE FUNCTION public.atend_ensure_conversa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _telefone text;
  _conv_id uuid;
  _now timestamptz := now();
BEGIN
  _telefone := CASE WHEN NEW.direction = 'in' THEN NEW.from_number ELSE NEW.to_number END;
  _telefone := regexp_replace(COALESCE(_telefone,''), '\D', '', 'g');
  IF _telefone IS NULL OR length(_telefone) < 5 THEN
    RETURN NEW;
  END IF;
  SELECT id INTO _conv_id FROM public.atend_conversas
    WHERE clinica_id = NEW.clinica_id
      AND canal = COALESCE(NEW.canal,'whatsapp')
      AND regexp_replace(COALESCE(contato_telefone,''), '\D', '', 'g') = _telefone
    ORDER BY created_at ASC
    LIMIT 1;
  IF _conv_id IS NULL THEN
    INSERT INTO public.atend_conversas (clinica_id, canal, contato_telefone, contato_nome, status, ultima_msg_em, ultima_msg_preview, janela_24h_em, unread_count)
    VALUES (NEW.clinica_id, COALESCE(NEW.canal,'whatsapp'), _telefone, _telefone, 'bot_attending', _now,
            COALESCE(NEW.body, '['||NEW.tipo||']'),
            CASE WHEN NEW.direction = 'in' THEN _now ELSE NULL END,
            CASE WHEN NEW.direction = 'in' THEN 1 ELSE 0 END)
    RETURNING id INTO _conv_id;
  ELSE
    UPDATE public.atend_conversas SET
      ultima_msg_em = _now,
      ultima_msg_preview = COALESCE(NEW.body, '['||NEW.tipo||']'),
      janela_24h_em = CASE WHEN NEW.direction = 'in' THEN _now ELSE janela_24h_em END,
      unread_count = CASE WHEN NEW.direction = 'in' THEN unread_count + 1 ELSE unread_count END,
      updated_at = _now
    WHERE id = _conv_id;
  END IF;
  NEW.conversa_id := _conv_id;
  RETURN NEW;
END;
$$;

-- 2) Mescla duplicatas na POLICLINICA MENINO JESUS
DO $$
DECLARE
  _clinica uuid;
  r record;
BEGIN
  SELECT id INTO _clinica FROM public.clinicas WHERE nome ILIKE '%MENINO JESUS%' LIMIT 1;
  IF _clinica IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT canal, regexp_replace(COALESCE(contato_telefone,''), '\D', '', 'g') AS tel_digits,
           (array_agg(id ORDER BY created_at ASC))[1] AS keep_id,
           array_agg(id) FILTER (WHERE true) AS all_ids
      FROM public.atend_conversas
     WHERE clinica_id = _clinica AND contato_telefone IS NOT NULL
     GROUP BY canal, regexp_replace(COALESCE(contato_telefone,''), '\D', '', 'g')
    HAVING count(*) > 1
  LOOP
    UPDATE public.whatsapp_mensagens SET conversa_id = r.keep_id
      WHERE conversa_id = ANY(r.all_ids) AND conversa_id <> r.keep_id;
    UPDATE public.atend_notas_internas SET conversa_id = r.keep_id
      WHERE conversa_id = ANY(r.all_ids) AND conversa_id <> r.keep_id;
    UPDATE public.atend_conversa_eventos SET conversa_id = r.keep_id
      WHERE conversa_id = ANY(r.all_ids) AND conversa_id <> r.keep_id;
    UPDATE public.atend_avaliacoes SET conversa_id = r.keep_id
      WHERE conversa_id = ANY(r.all_ids) AND conversa_id <> r.keep_id;
    UPDATE public.atend_transferencias SET conversa_id = r.keep_id
      WHERE conversa_id = ANY(r.all_ids) AND conversa_id <> r.keep_id;
    UPDATE public.atend_conversas k SET
      status = COALESCE((SELECT d.status FROM public.atend_conversas d WHERE d.id = ANY(r.all_ids) AND d.atribuida_user_id IS NOT NULL ORDER BY d.ultima_msg_em DESC NULLS LAST LIMIT 1), k.status),
      owner_type = COALESCE((SELECT d.owner_type FROM public.atend_conversas d WHERE d.id = ANY(r.all_ids) AND d.atribuida_user_id IS NOT NULL ORDER BY d.ultima_msg_em DESC NULLS LAST LIMIT 1), k.owner_type),
      atribuida_user_id = COALESCE(k.atribuida_user_id, (SELECT d.atribuida_user_id FROM public.atend_conversas d WHERE d.id = ANY(r.all_ids) AND d.atribuida_user_id IS NOT NULL ORDER BY d.ultima_msg_em DESC NULLS LAST LIMIT 1)),
      departamento_id = COALESCE(k.departamento_id, (SELECT d.departamento_id FROM public.atend_conversas d WHERE d.id = ANY(r.all_ids) AND d.departamento_id IS NOT NULL LIMIT 1)),
      contato_paciente_id = COALESCE(k.contato_paciente_id, (SELECT d.contato_paciente_id FROM public.atend_conversas d WHERE d.id = ANY(r.all_ids) AND d.contato_paciente_id IS NOT NULL LIMIT 1)),
      ultima_msg_em = (SELECT max(d.ultima_msg_em) FROM public.atend_conversas d WHERE d.id = ANY(r.all_ids)),
      ultima_msg_preview = COALESCE((SELECT d.ultima_msg_preview FROM public.atend_conversas d WHERE d.id = ANY(r.all_ids) ORDER BY d.ultima_msg_em DESC NULLS LAST LIMIT 1), k.ultima_msg_preview),
      janela_24h_em = (SELECT max(d.janela_24h_em) FROM public.atend_conversas d WHERE d.id = ANY(r.all_ids)),
      unread_count = (SELECT COALESCE(sum(d.unread_count),0) FROM public.atend_conversas d WHERE d.id = ANY(r.all_ids)),
      updated_at = now()
    WHERE k.id = r.keep_id;

    DELETE FROM public.atend_conversas WHERE id = ANY(r.all_ids) AND id <> r.keep_id;
  END LOOP;

  UPDATE public.atend_conversas
     SET contato_telefone = regexp_replace(COALESCE(contato_telefone,''), '\D', '', 'g')
   WHERE clinica_id = _clinica
     AND contato_telefone IS DISTINCT FROM regexp_replace(COALESCE(contato_telefone,''), '\D', '', 'g');
END $$;