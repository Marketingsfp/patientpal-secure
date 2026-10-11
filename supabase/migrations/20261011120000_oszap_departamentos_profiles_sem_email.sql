-- Corrige a listagem de Departamentos para o schema real de profiles.
-- A tabela public.profiles identifica a atendente por nome e não possui email.
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
        'nome', COALESCE(NULLIF(btrim(p.nome), ''), 'Atendente'),
        'departamentoId', a.departamento_id,
        'presenca', pr.estado_manual
      ) ORDER BY COALESCE(NULLIF(btrim(p.nome), ''), 'Atendente'), m.user_id)
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

REVOKE ALL ON FUNCTION public.atend_listar_departamentos(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atend_listar_departamentos(uuid, text) TO authenticated;
