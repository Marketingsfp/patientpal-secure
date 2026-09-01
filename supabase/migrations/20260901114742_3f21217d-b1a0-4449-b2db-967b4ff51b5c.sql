DO $$
DECLARE r RECORD;
BEGIN
  -- mescla duplicatas do mesmo contato (telefone com e sem "+"), mantendo a mais antiga
  FOR r IN
    SELECT c.id AS dup_id, k.keep_id
      FROM public.atend_conversas c
      JOIN (
        SELECT clinica_id, canal,
               regexp_replace(contato_telefone, '\D', '', 'g') AS tel,
               (array_agg(id ORDER BY created_at))[1] AS keep_id
          FROM public.atend_conversas
         WHERE contato_telefone IS NOT NULL
           AND regexp_replace(contato_telefone, '\D', '', 'g') <> ''
         GROUP BY 1, 2, 3
        HAVING count(*) > 1
      ) k ON k.clinica_id = c.clinica_id AND k.canal = c.canal
         AND k.tel = regexp_replace(c.contato_telefone, '\D', '', 'g')
     WHERE c.id <> k.keep_id
  LOOP
    UPDATE public.whatsapp_mensagens SET conversa_id = r.keep_id WHERE conversa_id = r.dup_id;
    UPDATE public.atend_conversa_eventos SET conversa_id = r.keep_id WHERE conversa_id = r.dup_id;
    UPDATE public.atend_notas_internas SET conversa_id = r.keep_id WHERE conversa_id = r.dup_id;
    UPDATE public.atend_transferencias SET conversa_id = r.keep_id WHERE conversa_id = r.dup_id;
    UPDATE public.atend_avaliacoes SET conversa_id = r.keep_id WHERE conversa_id = r.dup_id;

    UPDATE public.atend_conversas k
       SET ultima_msg_em = GREATEST(COALESCE(k.ultima_msg_em, d.ultima_msg_em), COALESCE(d.ultima_msg_em, k.ultima_msg_em)),
           ultima_msg_preview = CASE
             WHEN COALESCE(d.ultima_msg_em, '-infinity'::timestamptz) > COALESCE(k.ultima_msg_em, '-infinity'::timestamptz)
             THEN d.ultima_msg_preview ELSE k.ultima_msg_preview END,
           unread_count = COALESCE(k.unread_count, 0) + COALESCE(d.unread_count, 0),
           contato_nome = COALESCE(k.contato_nome, d.contato_nome),
           contato_paciente_id = COALESCE(k.contato_paciente_id, d.contato_paciente_id)
      FROM public.atend_conversas d
     WHERE k.id = r.keep_id AND d.id = r.dup_id;

    DELETE FROM public.atend_conversas WHERE id = r.dup_id;
  END LOOP;

  -- agora é seguro normalizar (sem colidir com a unique já existente)
  UPDATE public.atend_conversas
     SET contato_telefone = regexp_replace(contato_telefone, '\D', '', 'g')
   WHERE contato_telefone IS NOT NULL
     AND contato_telefone <> regexp_replace(contato_telefone, '\D', '', 'g');
END $$;