ALTER TABLE public.nina_instrucoes_versoes
  DROP CONSTRAINT IF EXISTS nina_instrucoes_versoes_escopo_check;

ALTER TABLE public.nina_instrucoes_versoes
  ADD CONSTRAINT nina_instrucoes_versoes_escopo_check
  CHECK (escopo IN ('whatsapp', 'painel_interno', 'homologacao'));

CREATE OR REPLACE FUNCTION public.nina_instrucoes_publicar(p_escopo text, p_conteudo text, p_comentario text DEFAULT NULL::text)
 RETURNS nina_instrucoes_versoes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_pode boolean;
  v_anterior public.nina_instrucoes_versoes;
  v_proxima integer;
  v_nova public.nina_instrucoes_versoes;
  v_permitidos text[];
  v_marcador text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.';
  END IF;

  IF p_escopo NOT IN ('whatsapp', 'painel_interno', 'homologacao') THEN
    RAISE EXCEPTION 'Escopo inválido: %', p_escopo;
  END IF;

  IF p_conteudo IS NULL OR btrim(p_conteudo) = '' THEN
    RAISE EXCEPTION 'O conteúdo das instruções não pode ficar vazio.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.user_id = v_uid AND m.ativo AND m.role = 'admin'
  ) INTO v_pode;

  IF NOT v_pode THEN
    RAISE EXCEPTION 'Apenas administradores podem publicar as instruções da Nina.';
  END IF;

  IF p_escopo = 'whatsapp' THEN
    v_permitidos := ARRAY['${nomeUnidade}', '${nomeCurtoUnidade}'];
  ELSIF p_escopo = 'painel_interno' THEN
    v_permitidos := ARRAY['${contextoTexto}'];
  ELSE
    v_permitidos := ARRAY[]::text[];
  END IF;

  FOR v_marcador IN
    SELECT DISTINCT m[1]
    FROM regexp_matches(p_conteudo, '\$\{[^}]*\}', 'g') AS m
  LOOP
    IF NOT (v_marcador = ANY (v_permitidos)) THEN
      RAISE EXCEPTION 'O texto usa o marcador %, que não existe. Marcadores disponíveis neste escopo: %',
        v_marcador, array_to_string(v_permitidos, ', ');
    END IF;
  END LOOP;

  PERFORM pg_advisory_xact_lock(hashtext('nina_instrucoes_publicar:' || p_escopo));

  SELECT * INTO v_anterior
  FROM public.nina_instrucoes_versoes
  WHERE clinica_id IS NULL AND escopo = p_escopo AND status = 'publicada'
  LIMIT 1;

  SELECT COALESCE(MAX(versao), 0) + 1 INTO v_proxima
  FROM public.nina_instrucoes_versoes
  WHERE clinica_id IS NULL AND escopo = p_escopo;

  IF v_anterior.id IS NOT NULL THEN
    UPDATE public.nina_instrucoes_versoes
       SET status = 'arquivada'
     WHERE id = v_anterior.id;
  END IF;

  UPDATE public.nina_instrucoes_versoes
     SET status = 'arquivada'
   WHERE clinica_id IS NULL AND escopo = p_escopo
     AND status = 'rascunho';

  INSERT INTO public.nina_instrucoes_versoes
    (clinica_id, escopo, versao, conteudo, status, comentario,
     versao_anterior_id, criado_por, publicado_por, publicado_em)
  VALUES
    (NULL, p_escopo, v_proxima, p_conteudo, 'publicada', p_comentario,
     v_anterior.id, v_uid, v_uid, now())
  RETURNING * INTO v_nova;

  RETURN v_nova;
END;
$function$;