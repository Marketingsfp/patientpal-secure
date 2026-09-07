-- Publicação de Instruções da Nina (escopo global: clinica_id IS NULL).
-- Sempre cria uma versão NOVA; a versão publicada anterior vira "arquivada".
-- Nenhuma linha é apagada ou sobrescrita.
CREATE OR REPLACE FUNCTION public.nina_instrucoes_publicar(
  p_escopo text,
  p_conteudo text,
  p_comentario text DEFAULT NULL
)
RETURNS public.nina_instrucoes_versoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pode boolean;
  v_anterior public.nina_instrucoes_versoes;
  v_proxima integer;
  v_nova public.nina_instrucoes_versoes;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.';
  END IF;

  IF p_escopo NOT IN ('whatsapp', 'painel_interno') THEN
    RAISE EXCEPTION 'Escopo inválido: %', p_escopo;
  END IF;

  IF p_conteudo IS NULL OR btrim(p_conteudo) = '' THEN
    RAISE EXCEPTION 'O conteúdo das instruções não pode ficar vazio.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.user_id = v_uid AND m.ativo AND m.role IN ('admin', 'gestor')
  ) INTO v_pode;

  IF NOT v_pode THEN
    RAISE EXCEPTION 'Apenas administradores e gestores podem publicar as instruções da Nina.';
  END IF;

  -- Trava a linha da versão vigente para evitar duas publicações simultâneas.
  SELECT * INTO v_anterior
  FROM public.nina_instrucoes_versoes
  WHERE clinica_id IS NULL AND escopo = p_escopo AND status = 'publicada'
  FOR UPDATE;

  SELECT COALESCE(MAX(versao), 0) + 1 INTO v_proxima
  FROM public.nina_instrucoes_versoes
  WHERE clinica_id IS NULL AND escopo = p_escopo;

  IF v_anterior.id IS NOT NULL THEN
    UPDATE public.nina_instrucoes_versoes
       SET status = 'arquivada', updated_at = now()
     WHERE id = v_anterior.id;
  END IF;

  -- Reaproveita o rascunho vigente como a nova versão publicada, se houver.
  UPDATE public.nina_instrucoes_versoes
     SET status = 'publicada',
         versao = v_proxima,
         conteudo = p_conteudo,
         comentario = NULLIF(btrim(COALESCE(p_comentario, '')), ''),
         versao_anterior_id = v_anterior.id,
         publicado_por = v_uid,
         publicado_em = now(),
         updated_at = now()
   WHERE clinica_id IS NULL AND escopo = p_escopo AND status = 'rascunho'
  RETURNING * INTO v_nova;

  IF v_nova.id IS NULL THEN
    INSERT INTO public.nina_instrucoes_versoes
      (clinica_id, escopo, versao, conteudo, status, comentario,
       versao_anterior_id, criado_por, publicado_por, publicado_em)
    VALUES
      (NULL, p_escopo, v_proxima, p_conteudo, 'publicada',
       NULLIF(btrim(COALESCE(p_comentario, '')), ''),
       v_anterior.id, v_uid, v_uid, now())
    RETURNING * INTO v_nova;
  END IF;

  RETURN v_nova;
END;
$$;

REVOKE ALL ON FUNCTION public.nina_instrucoes_publicar(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.nina_instrucoes_publicar(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nina_instrucoes_publicar(text, text, text) TO service_role;

-- Nome de quem criou/publicou cada versão, para o histórico.
CREATE OR REPLACE FUNCTION public.nina_instrucoes_autores(p_ids uuid[])
RETURNS TABLE (id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome
  FROM public.profiles p
  WHERE p.id = ANY(p_ids)
    AND EXISTS (
      SELECT 1 FROM public.clinica_memberships m
      WHERE m.user_id = auth.uid() AND m.ativo
    );
$$;

REVOKE ALL ON FUNCTION public.nina_instrucoes_autores(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.nina_instrucoes_autores(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nina_instrucoes_autores(uuid[]) TO service_role;