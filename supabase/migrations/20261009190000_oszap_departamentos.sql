-- Departamentos OS ZAP: implementação autorizada em 09/10/2026 para testes locais.
-- Publicação global DESLIGADA. Não aplicar/ativar em produção sem promoção aprovada.
-- Vínculos antigos de supervisão e conversas existentes permanecem intactos.

CREATE FUNCTION public.atend_departamentos_habilitados()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$ SELECT false $$;
REVOKE ALL ON FUNCTION public.atend_departamentos_habilitados() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atend_departamentos_habilitados() TO authenticated, service_role;

CREATE FUNCTION public.atend_gerencia_departamentos(_user_id uuid, _clinica_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.clinica_memberships m
    WHERE m.clinica_id = _clinica_id AND m.user_id = _user_id AND m.ativo
      AND m.role::text IN ('admin', 'supervisor'));
$$;
REVOKE ALL ON FUNCTION public.atend_gerencia_departamentos(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atend_gerencia_departamentos(uuid, uuid) TO authenticated, service_role;

-- A opção própria prevalece sobre a herança de Nina; exceções da pessoa são respeitadas.
CREATE FUNCTION public.atend_acesso_departamentos(_user_id uuid, _clinica_id uuid, _escrita boolean DEFAULT true)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.atend_gerencia_departamentos(_user_id, _clinica_id) AND (
    public.atend_usuario_e_admin(_user_id, _clinica_id) OR
    COALESCE(
      (SELECT u.acesso::text FROM public.usuario_permissoes u WHERE u.clinica_id = _clinica_id
        AND u.user_id = _user_id AND u.modulo = 'oszap-departamentos'),
      (SELECT pp.acesso::text FROM public.perfis_acesso p JOIN public.perfil_permissoes pp ON pp.perfil_id = p.id
        WHERE p.clinica_id = _clinica_id AND p.chave = 'supervisor' AND pp.modulo = 'oszap-departamentos'),
      (SELECT u.acesso::text FROM public.usuario_permissoes u WHERE u.clinica_id = _clinica_id
        AND u.user_id = _user_id AND u.modulo = 'nina'),
      (SELECT pp.acesso::text FROM public.perfis_acesso p JOIN public.perfil_permissoes pp ON pp.perfil_id = p.id
        WHERE p.clinica_id = _clinica_id AND p.chave = 'supervisor' AND pp.modulo = 'nina'),
      'write'
    ) = ANY(CASE WHEN _escrita THEN ARRAY['write'] ELSE ARRAY['read','write'] END));
$$;
REVOKE ALL ON FUNCTION public.atend_acesso_departamentos(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atend_acesso_departamentos(uuid, uuid, boolean) TO authenticated, service_role;

CREATE FUNCTION public.atend_nome_departamento(_nome text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT lower(translate(btrim(_nome), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
    'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'));
$$;
REVOKE ALL ON FUNCTION public.atend_nome_departamento(text) FROM PUBLIC, anon, authenticated;

CREATE TABLE public.atend_departamento_atendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  departamento_id uuid NOT NULL REFERENCES public.atend_departamentos(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid,
  UNIQUE (clinica_id, user_id)
);
CREATE INDEX idx_departamento_atendentes_destino
  ON public.atend_departamento_atendentes(clinica_id, departamento_id, user_id);
ALTER TABLE public.atend_departamento_atendentes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atend_departamento_atendentes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.atend_departamento_atendentes TO authenticated;
GRANT ALL ON public.atend_departamento_atendentes TO service_role;
CREATE POLICY departamento_atendentes_select ON public.atend_departamento_atendentes
  FOR SELECT TO authenticated USING (public.atend_acesso_departamentos(auth.uid(), clinica_id, false));

CREATE FUNCTION public.atend_validar_departamento_atendente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.atend_departamentos d
    WHERE d.id = NEW.departamento_id AND d.clinica_id = NEW.clinica_id AND d.ativo) THEN
    RAISE EXCEPTION 'Departamento não encontrado ou inativo nesta clínica' USING ERRCODE = '22023';
  END IF;
  IF NOT public.atend_tem_perfil_telefonia(NEW.user_id, NEW.clinica_id)
    OR public.atend_usuario_e_admin(NEW.user_id, NEW.clinica_id) THEN
    RAISE EXCEPTION 'Somente atendentes com perfil Telefonia podem ser vinculadas' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.atend_validar_departamento_atendente() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validar_departamento_atendente BEFORE INSERT OR UPDATE
  ON public.atend_departamento_atendentes FOR EACH ROW
  EXECUTE FUNCTION public.atend_validar_departamento_atendente();

CREATE FUNCTION public.atend_auditar_departamentos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _registro jsonb; _antes jsonb; _depois jsonb; _email text; _ip text;
BEGIN
  _registro := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  _ip := NULLIF(current_setting('app.oszap_ip_origem', true), '');
  IF _ip IS NULL THEN
    _ip := NULLIF(current_setting('request.headers', true), '')::jsonb->>'cf-connecting-ip';
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN _antes := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN _depois := to_jsonb(NEW); END IF;
  INSERT INTO public.audit_log(clinica_id, user_id, user_email, table_name, record_id, action, dados_antes, dados_depois)
    VALUES ((_registro->>'clinica_id')::uuid, auth.uid(), _email, TG_TABLE_NAME, _registro->>'id', TG_OP,
      CASE WHEN _antes IS NOT NULL THEN _antes || jsonb_build_object('_auditoria', jsonb_build_object('ip_origem', _ip)) END,
      CASE WHEN _depois IS NOT NULL THEN _depois || jsonb_build_object('_auditoria', jsonb_build_object('ip_origem', _ip)) END);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.atend_auditar_departamentos() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER audit_departamento_atendentes AFTER INSERT OR UPDATE OR DELETE
  ON public.atend_departamento_atendentes FOR EACH ROW EXECUTE FUNCTION public.atend_auditar_departamentos();
CREATE TRIGGER audit_oszap_departamentos AFTER INSERT OR UPDATE OR DELETE
  ON public.atend_departamentos FOR EACH ROW EXECUTE FUNCTION public.atend_auditar_departamentos();

-- Apenas vínculos legados inequívocos, sem escolher entre múltiplos setores.
INSERT INTO public.atend_departamento_atendentes(clinica_id, user_id, departamento_id)
SELECT m.clinica_id, m.user_id, (array_agg(DISTINCT m.departamento_id))[1]
FROM public.atend_departamento_membros m
WHERE public.atend_tem_perfil_telefonia(m.user_id, m.clinica_id)
  AND NOT public.atend_usuario_e_admin(m.user_id, m.clinica_id)
  AND EXISTS (SELECT 1 FROM public.atend_departamentos d
    WHERE d.id = m.departamento_id AND d.clinica_id = m.clinica_id AND d.ativo)
GROUP BY m.clinica_id, m.user_id HAVING count(DISTINCT m.departamento_id) = 1;

-- Departamentos iniciais para todas as clínicas, preservando cadastros equivalentes.
INSERT INTO public.atend_departamentos(clinica_id, nome)
SELECT c.id, n.nome FROM public.clinicas c
CROSS JOIN (VALUES ('Recepção'), ('Laboratório'), ('Tomografia'), ('Ressonância')) n(nome)
WHERE NOT EXISTS (SELECT 1 FROM public.atend_departamentos d
  WHERE d.clinica_id = c.id AND public.atend_nome_departamento(d.nome) = public.atend_nome_departamento(n.nome));

CREATE FUNCTION public.atend_inicializar_departamentos(_clinica_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _nome text;
BEGIN
  IF NOT public.atend_departamentos_habilitados()
    OR NOT public.atend_acesso_departamentos(auth.uid(), _clinica_id) THEN
    RAISE EXCEPTION 'Departamentos indisponíveis ou sem permissão' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('atend_assign:' || _clinica_id::text));
  -- Inicializa só uma clínica sem cadastro, para não recriar departamentos renomeados.
  IF EXISTS (SELECT 1 FROM public.atend_departamentos WHERE clinica_id = _clinica_id) THEN RETURN; END IF;
  FOREACH _nome IN ARRAY ARRAY['Recepção', 'Laboratório', 'Tomografia', 'Ressonância'] LOOP
    INSERT INTO public.atend_departamentos(clinica_id, nome) VALUES (_clinica_id, _nome);
  END LOOP;
END;
$$;

CREATE FUNCTION public.atend_salvar_departamento(_clinica_id uuid, _nome text, _id uuid DEFAULT NULL, _ip_origem text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _resultado uuid;
BEGIN
  IF NOT public.atend_departamentos_habilitados()
    OR NOT public.atend_acesso_departamentos(auth.uid(), _clinica_id) THEN
    RAISE EXCEPTION 'Somente Administrador e Supervisor gerenciam departamentos' USING ERRCODE = '42501';
  END IF;
  IF _nome IS NULL OR length(btrim(_nome)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Informe um nome de até 120 caracteres' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('atend_assign:' || _clinica_id::text));
  PERFORM set_config('app.oszap_ip_origem', left(COALESCE(_ip_origem, ''), 128), true);
  IF EXISTS (SELECT 1 FROM public.atend_departamentos d WHERE d.clinica_id = _clinica_id
    AND (_id IS NULL OR d.id <> _id)
    AND public.atend_nome_departamento(d.nome) = public.atend_nome_departamento(_nome)) THEN
    RAISE EXCEPTION 'Já existe um departamento com esse nome' USING ERRCODE = '22023';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.atend_departamentos(clinica_id, nome) VALUES (_clinica_id, btrim(_nome))
      RETURNING id INTO _resultado;
  ELSE
    UPDATE public.atend_departamentos SET nome = btrim(_nome)
      WHERE id = _id AND clinica_id = _clinica_id RETURNING id INTO _resultado;
    IF NOT FOUND THEN RAISE EXCEPTION 'Departamento não encontrado nesta clínica' USING ERRCODE = '22023'; END IF;
  END IF;
  RETURN _resultado;
END;
$$;

CREATE FUNCTION public.atend_vincular_departamento(
  _clinica_id uuid, _user_id uuid, _departamento_id uuid DEFAULT NULL, _ip_origem text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.atend_departamentos_habilitados()
    OR NOT public.atend_acesso_departamentos(auth.uid(), _clinica_id) THEN
    RAISE EXCEPTION 'Somente Administrador e Supervisor gerenciam departamentos' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('atend_assign:' || _clinica_id::text));
  -- Protege a alteração de perfil/desativação simultânea.
  PERFORM set_config('app.oszap_ip_origem', left(COALESCE(_ip_origem, ''), 128), true);
  PERFORM 1 FROM public.clinica_memberships m
    WHERE m.clinica_id = _clinica_id AND m.user_id = _user_id AND m.ativo
      AND m.role::text = 'telefonia' FOR SHARE;
  IF NOT FOUND OR public.atend_usuario_e_admin(_user_id, _clinica_id) THEN
    RAISE EXCEPTION 'Somente atendentes com perfil Telefonia podem ser vinculadas' USING ERRCODE = '42501';
  END IF;
  IF _departamento_id IS NULL THEN
    DELETE FROM public.atend_departamento_atendentes WHERE clinica_id = _clinica_id AND user_id = _user_id;
  ELSE
    PERFORM 1 FROM public.atend_departamentos d
      WHERE d.id = _departamento_id AND d.clinica_id = _clinica_id AND d.ativo FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Departamento não encontrado ou inativo nesta clínica' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.atend_departamento_atendentes(clinica_id, user_id, departamento_id, atualizado_por)
      VALUES (_clinica_id, _user_id, _departamento_id, auth.uid())
      ON CONFLICT (clinica_id, user_id) DO UPDATE SET
        departamento_id = EXCLUDED.departamento_id, atualizado_em = now(), atualizado_por = auth.uid()
      WHERE atend_departamento_atendentes.departamento_id IS DISTINCT FROM EXCLUDED.departamento_id;
  END IF;
END;
$$;

CREATE FUNCTION public.atend_transferir_departamento(
  _clinica_id uuid, _conversa_id uuid, _departamento_id uuid,
  _responsavel_esperado uuid, _motivo text DEFAULT NULL, _ip_origem text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _conv public.atend_conversas%ROWTYPE; _destino uuid; _cand record; _setor text;
BEGIN
  IF NOT public.atend_departamentos_habilitados()
    OR auth.uid() IS NULL OR NOT public.is_member(auth.uid(), _clinica_id) THEN
    RAISE EXCEPTION 'Departamentos indisponíveis ou sem acesso à clínica' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('atend_assign:' || _clinica_id::text));
  SELECT * INTO _conv FROM public.atend_conversas
    WHERE id = _conversa_id AND clinica_id = _clinica_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversa não encontrada nesta clínica' USING ERRCODE = '22023'; END IF;
  IF _conv.is_teste IS TRUE OR _conv.status IN ('closed', 'finished', 'resolved') THEN
    RAISE EXCEPTION 'A conversa não está disponível para transferência' USING ERRCODE = '22023';
  END IF;
  IF _conv.atribuida_user_id IS DISTINCT FROM _responsavel_esperado THEN
    RAISE EXCEPTION 'A responsável mudou. Atualize a conversa antes de transferir' USING ERRCODE = '40001';
  END IF;
  IF _conv.atribuida_user_id IS DISTINCT FROM auth.uid()
    AND NOT public.can_manage_clinica(auth.uid(), _clinica_id)
    AND NOT public.atend_gerencia_departamentos(auth.uid(), _clinica_id) THEN
    RAISE EXCEPTION 'Você não pode transferir esta conversa' USING ERRCODE = '42501';
  END IF;
  SELECT nome INTO _setor FROM public.atend_departamentos
    WHERE id = _departamento_id AND clinica_id = _clinica_id AND ativo FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Departamento não encontrado ou inativo nesta clínica' USING ERRCODE = '22023'; END IF;
  -- A mesma elegibilidade da distribuição; ordem aleatória exclusivamente na transferência por setor.
  FOR _cand IN SELECT p.user_id FROM public.atend_pool_canonico(_clinica_id, _departamento_id) p
    WHERE p.elegivel AND p.do_setor ORDER BY random()
  LOOP
    -- Vínculo, perfil e presença ficam estáveis até o commit.
    PERFORM 1 FROM public.atend_departamento_atendentes a WHERE a.clinica_id = _clinica_id
      AND a.user_id = _cand.user_id AND a.departamento_id = _departamento_id FOR SHARE;
    IF NOT FOUND THEN CONTINUE; END IF;
    PERFORM 1 FROM public.clinica_memberships m WHERE m.clinica_id = _clinica_id
      AND m.user_id = _cand.user_id AND m.ativo AND m.role::text = 'telefonia' FOR SHARE;
    IF NOT FOUND THEN CONTINUE; END IF;
    PERFORM 1 FROM public.atend_agente_presenca p WHERE p.clinica_id = _clinica_id
      AND p.user_id = _cand.user_id AND p.estado_manual = 'ONLINE' FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.atend_pool_canonico(_clinica_id, _departamento_id) p
      WHERE p.user_id = _cand.user_id AND p.elegivel AND p.do_setor) THEN CONTINUE; END IF;
    _destino := _cand.user_id;
    EXIT;
  END LOOP;
  IF _destino IS NULL THEN
    RAISE EXCEPTION 'Nenhuma atendente disponível online neste departamento. A conversa permanece com a atendente atual'
      USING ERRCODE = '22023';
  END IF;
  IF _destino = _conv.atribuida_user_id AND _departamento_id IS NOT DISTINCT FROM _conv.departamento_id THEN
    RETURN _destino;
  END IF;
  UPDATE public.atend_conversas SET atribuida_user_id = _destino,
    departamento_id = _departamento_id, status = 'active', owner_type = 'HUMAN',
    ai_enabled = false, assigned_at = now(), atribuicao_origem = 'manual_transfer', updated_at = now()
    WHERE id = _conversa_id AND clinica_id = _clinica_id;
  INSERT INTO public.atend_transferencias(clinica_id, conversa_id, de_user_id, para_user_id,
    de_departamento_id, para_departamento_id, motivo)
    VALUES (_clinica_id, _conversa_id, _conv.atribuida_user_id, _destino,
      _conv.departamento_id, _departamento_id, _motivo);
  INSERT INTO public.atend_conversa_eventos(clinica_id, conversa_id, evento, user_id, departamento_id, motivo, detalhes)
    VALUES (_clinica_id, _conversa_id, 'TRANSFERIDA', auth.uid(), _departamento_id, _motivo,
      jsonb_build_object('manual', true, 'de_user_id', _conv.atribuida_user_id,
        'para_user_id', _destino, 'setor_nome', _setor, 'setor', true, 'sorteio', true,
        'ip_origem', left(_ip_origem, 128)));
  RETURN _destino;
END;
$$;

REVOKE ALL ON FUNCTION public.atend_inicializar_departamentos(uuid),
  public.atend_salvar_departamento(uuid, text, uuid, text),
  public.atend_vincular_departamento(uuid, uuid, uuid, text),
  public.atend_transferir_departamento(uuid, uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atend_inicializar_departamentos(uuid),
  public.atend_salvar_departamento(uuid, text, uuid, text),
  public.atend_vincular_departamento(uuid, uuid, uuid, text),
  public.atend_transferir_departamento(uuid, uuid, uuid, uuid, text, text) TO authenticated;

-- O pool canônico abaixo mantém o comportamento anterior com o controle desligado.
CREATE FUNCTION public.atend_listar_departamentos(_clinica_id uuid, _ip_origem text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.atend_departamentos_habilitados()
    OR NOT public.atend_acesso_departamentos(auth.uid(), _clinica_id, false) THEN
    RAISE EXCEPTION 'Somente Administrador e Supervisor acessam departamentos' USING ERRCODE = '42501';
  END IF;
  IF public.atend_acesso_departamentos(auth.uid(), _clinica_id) THEN
    PERFORM set_config('app.oszap_ip_origem', left(COALESCE(_ip_origem, ''), 128), true);
    PERFORM public.atend_inicializar_departamentos(_clinica_id);
  END IF;
  RETURN jsonb_build_object(
    'departamentos', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.nome, 'ativo', d.ativo) ORDER BY d.nome)
      FROM public.atend_departamentos d WHERE d.clinica_id = _clinica_id), '[]'::jsonb),
    'atendentes', COALESCE((SELECT jsonb_agg(jsonb_build_object('userId', m.user_id,
      'nome', COALESCE(NULLIF(p.nome, ''), p.email, 'Atendente'), 'departamentoId', a.departamento_id,
      'presenca', pr.estado_manual) ORDER BY p.nome, m.user_id)
      FROM (SELECT DISTINCT cm.user_id FROM public.clinica_memberships cm
        WHERE cm.clinica_id = _clinica_id AND cm.ativo AND cm.role::text = 'telefonia'
          AND NOT public.atend_usuario_e_admin(cm.user_id, _clinica_id)) m
      LEFT JOIN public.profiles p ON p.id = m.user_id
      LEFT JOIN public.atend_departamento_atendentes a ON a.clinica_id = _clinica_id AND a.user_id = m.user_id
      LEFT JOIN public.atend_agente_presenca pr ON pr.clinica_id = _clinica_id AND pr.user_id = m.user_id), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.atend_listar_departamentos(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atend_listar_departamentos(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.atend_pool_canonico(_clinica_id uuid, _departamento_id uuid DEFAULT NULL)
RETURNS TABLE (
  user_id uuid, perfil text, estado_manual text, presence_status text,
  perfil_telefonia boolean, admin boolean, em_pausa boolean, fila_travada boolean,
  load_at_selection integer, capacidade integer, capacidade_origem text,
  ultima_atribuicao timestamptz, do_setor boolean, elegivel boolean, motivo_exclusao text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH usuarios AS (
    SELECT m.user_id FROM public.clinica_memberships m WHERE m.clinica_id = _clinica_id
    UNION
    SELECT p.user_id FROM public.atend_agente_presenca p WHERE p.clinica_id = _clinica_id
  ), base AS (
    SELECT u.user_id,
      (SELECT m.role::text FROM public.clinica_memberships m
        WHERE m.clinica_id = _clinica_id AND m.user_id = u.user_id AND m.ativo = true
        ORDER BY m.role::text LIMIT 1) AS perfil,
      p.estado_manual, p.status::text AS presence_status,
      public.atend_tem_perfil_telefonia(u.user_id, _clinica_id) AS perfil_telefonia,
      public.atend_usuario_e_admin(u.user_id, _clinica_id) AS admin,
      COALESCE(p.estado_manual IN ('PAUSA', 'PAUSA_SAIDA'), false) AS em_pausa,
      EXISTS (SELECT 1 FROM public.atend_departamento_membros dm
        WHERE dm.clinica_id = _clinica_id AND dm.user_id = u.user_id AND dm.queue_locked)
      AND NOT EXISTS (SELECT 1 FROM public.atend_departamento_membros dm
        WHERE dm.clinica_id = _clinica_id AND dm.user_id = u.user_id
          AND dm.queue_locked IS FALSE) AS fila_travada,
      (SELECT count(*)::integer FROM public.atend_conversas c
        WHERE c.clinica_id = _clinica_id AND c.atribuida_user_id = u.user_id
          AND c.is_teste IS NOT TRUE AND c.status IN ('waiting', 'active', 'in_progress')) AS carga,
      NULL::integer AS capacidade,
      'sem_limite'::text AS capacidade_origem,
      (SELECT max(c.assigned_at) FROM public.atend_conversas c
        WHERE c.clinica_id = _clinica_id AND c.atribuida_user_id = u.user_id
          AND c.is_teste IS NOT TRUE) AS ultima_atribuicao,
      (_departamento_id IS NULL OR CASE WHEN public.atend_departamentos_habilitados() THEN EXISTS (
        SELECT 1 FROM public.atend_departamento_atendentes dm
        JOIN public.atend_departamentos d ON d.id = dm.departamento_id AND d.clinica_id = dm.clinica_id AND d.ativo
        WHERE dm.clinica_id = _clinica_id AND dm.user_id = u.user_id AND dm.departamento_id = _departamento_id
      ) ELSE EXISTS (
        SELECT 1 FROM public.atend_departamento_membros dm
        WHERE dm.clinica_id = _clinica_id AND dm.user_id = u.user_id AND dm.departamento_id = _departamento_id
      ) END) AS do_setor
    FROM usuarios u
    LEFT JOIN public.atend_agente_presenca p ON p.clinica_id = _clinica_id AND p.user_id = u.user_id
  ), avaliado AS (
    SELECT b.*, CASE
      WHEN NOT b.perfil_telefonia THEN 'sem_perfil_telefonia'
      WHEN b.admin THEN 'admin_excluido'
      WHEN b.estado_manual IS NULL THEN 'sem_escolha_manual'
      WHEN b.estado_manual <> 'ONLINE' THEN 'escolha_manual_' || lower(b.estado_manual)
      WHEN b.fila_travada THEN 'fila_bloqueada'
      ELSE NULL END AS motivo
    FROM base b
  ), final AS (
    SELECT a.*, CASE
      WHEN a.motivo IS NOT NULL THEN a.motivo
      WHEN NOT a.do_setor AND public.atend_departamentos_habilitados() THEN 'setor_incompativel'
      WHEN NOT a.do_setor AND EXISTS (SELECT 1 FROM avaliado s WHERE s.do_setor AND s.motivo IS NULL)
        THEN 'setor_incompativel'
      ELSE NULL END AS motivo_final
    FROM avaliado a
  )
  SELECT f.user_id, f.perfil, f.estado_manual, f.presence_status,
    f.perfil_telefonia, f.admin, f.em_pausa, f.fila_travada,
    f.carga, f.capacidade, f.capacidade_origem, f.ultima_atribuicao,
    f.do_setor, f.motivo_final IS NULL, f.motivo_final
  FROM final f
  ORDER BY (f.motivo_final IS NULL) DESC, f.carga ASC,
    f.ultima_atribuicao ASC NULLS FIRST, f.user_id ASC;
$function$;
