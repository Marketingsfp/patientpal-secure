-- Publica os três setores operacionais fixos do OS ZAP.
-- Preserva departamentos e históricos anteriores; somente vínculos atuais e
-- conversas abertas de Tomografia/Ressonância passam ao setor combinado.

CREATE OR REPLACE FUNCTION public.atend_departamentos_habilitados()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$ SELECT true $$;

CREATE OR REPLACE FUNCTION public.atend_garantir_setores_fixos(_clinica_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _nome text;
BEGIN
  FOREACH _nome IN ARRAY ARRAY['Recepção', 'Laboratório', 'Tomografia e Ressonância'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.atend_departamentos d
      WHERE d.clinica_id = _clinica_id
        AND public.atend_nome_departamento(d.nome) = public.atend_nome_departamento(_nome)
    ) THEN
      INSERT INTO public.atend_departamentos(clinica_id, nome, ativo)
      VALUES (_clinica_id, _nome, true);
    END IF;
    UPDATE public.atend_departamentos d
      SET nome = _nome, ativo = true
      WHERE d.id = (
        SELECT escolhido.id FROM public.atend_departamentos escolhido
        WHERE escolhido.clinica_id = _clinica_id
          AND public.atend_nome_departamento(escolhido.nome) = public.atend_nome_departamento(_nome)
        ORDER BY escolhido.ativo DESC, escolhido.id
        LIMIT 1
      );
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.atend_garantir_setores_fixos(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atend_garantir_setores_fixos(uuid) TO service_role;

DO $$
DECLARE _clinica record; _recepcao uuid; _imagem uuid;
BEGIN
  FOR _clinica IN SELECT id FROM public.clinicas LOOP
    PERFORM public.atend_garantir_setores_fixos(_clinica.id);
    SELECT d.id INTO _recepcao FROM public.atend_departamentos d
      WHERE d.clinica_id = _clinica.id
        AND public.atend_nome_departamento(d.nome) = 'recepcao'
        AND d.ativo
      ORDER BY d.id LIMIT 1;
    SELECT d.id INTO _imagem FROM public.atend_departamentos d
      WHERE d.clinica_id = _clinica.id
        AND public.atend_nome_departamento(d.nome) = 'tomografia e ressonancia'
        AND d.ativo
      ORDER BY d.id LIMIT 1;

    UPDATE public.atend_departamento_atendentes a
      SET departamento_id = _imagem, atualizado_em = now(), atualizado_por = auth.uid()
      FROM public.atend_departamentos antigo
      WHERE a.clinica_id = _clinica.id
        AND antigo.id = a.departamento_id
        AND antigo.clinica_id = _clinica.id
        AND public.atend_nome_departamento(antigo.nome) IN ('tomografia', 'ressonancia');

    UPDATE public.atend_conversas c
      SET departamento_id = _imagem, updated_at = now()
      FROM public.atend_departamentos antigo
      WHERE c.clinica_id = _clinica.id
        AND antigo.id = c.departamento_id
        AND antigo.clinica_id = _clinica.id
        AND public.atend_nome_departamento(antigo.nome) IN ('tomografia', 'ressonancia')
        AND c.status NOT IN ('closed', 'finished', 'resolved');

    UPDATE public.atend_departamentos d SET ativo = false
      WHERE d.clinica_id = _clinica.id
        AND public.atend_nome_departamento(d.nome) IN ('tomografia', 'ressonancia');

    INSERT INTO public.atend_departamento_atendentes(
      clinica_id, user_id, departamento_id, atualizado_por
    )
    SELECT _clinica.id, m.user_id, _recepcao, auth.uid()
    FROM (
      SELECT DISTINCT cm.user_id FROM public.clinica_memberships cm
      WHERE cm.clinica_id = _clinica.id AND cm.ativo AND cm.role::text = 'telefonia'
        AND NOT public.atend_usuario_e_admin(cm.user_id, _clinica.id)
    ) m
    WHERE NOT EXISTS (
      SELECT 1 FROM public.atend_departamento_atendentes a
      WHERE a.clinica_id = _clinica.id AND a.user_id = m.user_id
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.atend_inicializar_departamentos(_clinica_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _recepcao uuid;
BEGIN
  IF NOT public.atend_departamentos_habilitados()
    OR NOT public.atend_acesso_departamentos(auth.uid(), _clinica_id) THEN
    RAISE EXCEPTION 'Departamentos indisponíveis ou sem permissão' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('atend_assign:' || _clinica_id::text));
  PERFORM public.atend_garantir_setores_fixos(_clinica_id);
  SELECT d.id INTO _recepcao FROM public.atend_departamentos d
    WHERE d.clinica_id = _clinica_id
      AND public.atend_nome_departamento(d.nome) = 'recepcao' AND d.ativo
    ORDER BY d.id LIMIT 1;
  INSERT INTO public.atend_departamento_atendentes(clinica_id, user_id, departamento_id, atualizado_por)
  SELECT _clinica_id, m.user_id, _recepcao, auth.uid()
  FROM (
    SELECT DISTINCT cm.user_id FROM public.clinica_memberships cm
    WHERE cm.clinica_id = _clinica_id AND cm.ativo AND cm.role::text = 'telefonia'
      AND NOT public.atend_usuario_e_admin(cm.user_id, _clinica_id)
  ) m
  WHERE NOT EXISTS (
    SELECT 1 FROM public.atend_departamento_atendentes a
    WHERE a.clinica_id = _clinica_id AND a.user_id = m.user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.atend_salvar_departamento(
  _clinica_id uuid, _nome text, _id uuid DEFAULT NULL, _ip_origem text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.atend_departamentos_habilitados()
    OR NOT public.atend_acesso_departamentos(auth.uid(), _clinica_id) THEN
    RAISE EXCEPTION 'Somente Administrador e Supervisor gerenciam departamentos' USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'Os setores do OS ZAP são fixos: Recepção, Laboratório e Tomografia e Ressonância'
    USING ERRCODE = '22023';
END;
$$;

CREATE OR REPLACE FUNCTION public.atend_vincular_departamento(
  _clinica_id uuid, _user_id uuid, _departamento_id uuid DEFAULT NULL, _ip_origem text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _destino uuid := _departamento_id;
BEGIN
  IF NOT public.atend_departamentos_habilitados()
    OR NOT public.atend_acesso_departamentos(auth.uid(), _clinica_id) THEN
    RAISE EXCEPTION 'Somente Administrador e Supervisor gerenciam departamentos' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('atend_assign:' || _clinica_id::text));
  PERFORM public.atend_garantir_setores_fixos(_clinica_id);
  PERFORM set_config('app.oszap_ip_origem', left(COALESCE(_ip_origem, ''), 128), true);
  PERFORM 1 FROM public.clinica_memberships m
    WHERE m.clinica_id = _clinica_id AND m.user_id = _user_id AND m.ativo
      AND m.role::text = 'telefonia' FOR SHARE;
  IF NOT FOUND OR public.atend_usuario_e_admin(_user_id, _clinica_id) THEN
    RAISE EXCEPTION 'Somente atendentes com perfil Telefonia podem ser vinculadas' USING ERRCODE = '42501';
  END IF;
  IF _destino IS NULL THEN
    SELECT d.id INTO _destino FROM public.atend_departamentos d
      WHERE d.clinica_id = _clinica_id
        AND public.atend_nome_departamento(d.nome) = 'recepcao' AND d.ativo
      ORDER BY d.id LIMIT 1;
  END IF;
  PERFORM 1 FROM public.atend_departamentos d
    WHERE d.id = _destino AND d.clinica_id = _clinica_id AND d.ativo
      AND public.atend_nome_departamento(d.nome) IN (
        'recepcao', 'laboratorio', 'tomografia e ressonancia'
      ) FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escolha Recepção, Laboratório ou Tomografia e Ressonância' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.atend_departamento_atendentes(
    clinica_id, user_id, departamento_id, atualizado_por
  ) VALUES (_clinica_id, _user_id, _destino, auth.uid())
  ON CONFLICT (clinica_id, user_id) DO UPDATE SET
    departamento_id = EXCLUDED.departamento_id,
    atualizado_em = now(),
    atualizado_por = auth.uid()
  WHERE atend_departamento_atendentes.departamento_id IS DISTINCT FROM EXCLUDED.departamento_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.atend_listar_departamentos(
  _clinica_id uuid, _ip_origem text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
    'departamentos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.nome, 'ativo', d.ativo)
        ORDER BY CASE public.atend_nome_departamento(d.nome)
          WHEN 'recepcao' THEN 1 WHEN 'laboratorio' THEN 2 ELSE 3 END)
      FROM public.atend_departamentos d
      WHERE d.clinica_id = _clinica_id AND d.ativo
        AND public.atend_nome_departamento(d.nome) IN (
          'recepcao', 'laboratorio', 'tomografia e ressonancia'
        )
    ), '[]'::jsonb),
    'atendentes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'userId', m.user_id,
        'nome', COALESCE(NULLIF(p.nome, ''), p.email, 'Atendente'),
        'departamentoId', a.departamento_id,
        'presenca', pr.estado_manual
      ) ORDER BY p.nome, m.user_id)
      FROM (
        SELECT DISTINCT cm.user_id FROM public.clinica_memberships cm
        WHERE cm.clinica_id = _clinica_id AND cm.ativo AND cm.role::text = 'telefonia'
          AND NOT public.atend_usuario_e_admin(cm.user_id, _clinica_id)
      ) m
      LEFT JOIN public.profiles p ON p.id = m.user_id
      LEFT JOIN public.atend_departamento_atendentes a
        ON a.clinica_id = _clinica_id AND a.user_id = m.user_id
      LEFT JOIN public.atend_agente_presenca pr
        ON pr.clinica_id = _clinica_id AND pr.user_id = m.user_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.atend_atribuir_recepcao_nova_telefonia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _recepcao uuid;
BEGIN
  IF NEW.ativo AND NEW.role::text = 'telefonia'
    AND NOT public.atend_usuario_e_admin(NEW.user_id, NEW.clinica_id) THEN
    PERFORM public.atend_garantir_setores_fixos(NEW.clinica_id);
    SELECT d.id INTO _recepcao FROM public.atend_departamentos d
      WHERE d.clinica_id = NEW.clinica_id
        AND public.atend_nome_departamento(d.nome) = 'recepcao' AND d.ativo
      ORDER BY d.id LIMIT 1;
    INSERT INTO public.atend_departamento_atendentes(
      clinica_id, user_id, departamento_id, atualizado_por
    ) VALUES (NEW.clinica_id, NEW.user_id, _recepcao, auth.uid())
    ON CONFLICT (clinica_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.atend_atribuir_recepcao_nova_telefonia() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'atribuir_recepcao_nova_telefonia'
      AND tgrelid = 'public.clinica_memberships'::regclass
  ) THEN
    CREATE TRIGGER atribuir_recepcao_nova_telefonia
      AFTER INSERT OR UPDATE OF role, ativo ON public.clinica_memberships
      FOR EACH ROW EXECUTE FUNCTION public.atend_atribuir_recepcao_nova_telefonia();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.atend_inicializar_departamentos(uuid),
  public.atend_salvar_departamento(uuid, text, uuid, text),
  public.atend_vincular_departamento(uuid, uuid, uuid, text),
  public.atend_listar_departamentos(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atend_inicializar_departamentos(uuid),
  public.atend_salvar_departamento(uuid, text, uuid, text),
  public.atend_vincular_departamento(uuid, uuid, uuid, text),
  public.atend_listar_departamentos(uuid, text) TO authenticated;