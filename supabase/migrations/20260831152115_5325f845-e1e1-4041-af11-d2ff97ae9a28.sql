-- Bug 1: pgcrypto qualificado com schema explicito
CREATE OR REPLACE FUNCTION public.gen_token_publico_clinica()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.token_publico IS NULL THEN
    -- CORRECAO AQUI: schema "extensions" explicito (pgcrypto nao esta no search_path).
    NEW.token_publico := replace(replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '/', '_'), '+', '-'), '=', '');
  END IF;
  RETURN NEW;
END;
$function$;

-- Bug 2: infraestrutura minima de uma clinica nova (idempotente, sem dado operacional)
CREATE OR REPLACE FUNCTION public.seed_clinica_padrao(_clinica_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _perfis CONSTANT text[][] := ARRAY[
    ARRAY['admin','ADMIN','Acesso total ao sistema. Pode gerenciar unidades, equipe, perfis, configuracoes e todas as areas operacionais e financeiras.'],
    ARRAY['gestor','GESTOR','Gestao operacional da unidade: acompanha indicadores, equipe, agenda e financeiro, sem acesso a configuracoes sensiveis.'],
    ARRAY['recepcao','RECEPCAO','Atendimento de pacientes na recepcao: agendamentos, check-in, filas e cadastro de clientes.'],
    ARRAY['caixa','CAIXA','Operacao de caixa diario: recebimentos, pagamentos no balcao e fechamento de caixa.'],
    ARRAY['medico','MEDICO','Profissional clinico: realiza atendimentos, prontuarios, prescricoes e visualiza seus repasses.'],
    ARRAY['enfermeiro','ENFERMEIRO','Atuacao clinica de enfermagem: triagem, alertas e acompanhamento de pacientes.'],
    ARRAY['financeiro','FINANCEIRO','Gestao financeira completa: contas a pagar/receber, conciliacao bancaria, relatorios e BI.']
  ];
  _modulos CONSTANT text[] := ARRAY(SELECT jsonb_array_elements_text('["agenda","checkin","caixa","chat","clientes","dashboard","fluxo","orcamentos","recepcao","triagem-enfermagem","cartao-beneficios","painel","documentos","atendimento-multiplo","atendimento-ia","crm","alertas-enfermagem","consulta-rapida","nina","odontologia","prontuarios","anamneses","exames-resultados","mkt-leads","campanhas","mkt-envios","mkt-landing","mkt-segmentos","equipe","especialidades","disponibilidades","prontuario-modelos","perfis","unidades","medicos","procedimentos","planos","estoque","modelos-documentos","clinicas","tipos-servico","hr-ponto","hr-contratos","hr-ferias","hr-holerites","treinamentos","lms-admin","cargos","financeiro","funcionarios","relatorios","auditoria","setores","boletos","contratos","nfse","integration-secrets","lgpd","painel-executivo"]'::jsonb));
  _matriz CONSTANT jsonb := '{"admin":{"write":["agenda","checkin","caixa","chat","clientes","dashboard","fluxo","orcamentos","recepcao","triagem-enfermagem","cartao-beneficios","painel","documentos","atendimento-multiplo","atendimento-ia","crm","alertas-enfermagem","consulta-rapida","nina","odontologia","prontuarios","anamneses","exames-resultados","mkt-leads","campanhas","mkt-envios","mkt-landing","mkt-segmentos","equipe","especialidades","disponibilidades","prontuario-modelos","perfis","unidades","medicos","procedimentos","planos","estoque","modelos-documentos","clinicas","tipos-servico","hr-ponto","hr-contratos","hr-ferias","hr-holerites","treinamentos","lms-admin","cargos","financeiro","funcionarios","relatorios","auditoria","setores","boletos","contratos","nfse","integration-secrets","lgpd","painel-executivo"],"read":[]},"gestor":{"write":["agenda","checkin","caixa","chat","clientes","dashboard","fluxo","orcamentos","recepcao","cartao-beneficios","painel","documentos","atendimento-multiplo","crm","nina","mkt-leads","campanhas","mkt-envios","mkt-landing","mkt-segmentos","equipe","especialidades","disponibilidades","prontuario-modelos","unidades","medicos","procedimentos","planos","estoque","modelos-documentos","tipos-servico","hr-ponto","hr-contratos","hr-ferias","treinamentos","lms-admin","cargos","financeiro","funcionarios","relatorios","setores","boletos","contratos","nfse","painel-executivo"],"read":["triagem-enfermagem","atendimento-ia","alertas-enfermagem","consulta-rapida","odontologia","prontuarios","anamneses","exames-resultados","perfis","hr-holerites","auditoria","lgpd"]},"recepcao":{"write":["agenda","checkin","caixa","chat","clientes","fluxo","orcamentos","recepcao","painel","atendimento-multiplo"],"read":["dashboard","cartao-beneficios","documentos","consulta-rapida","especialidades","disponibilidades","medicos","procedimentos","planos","tipos-servico","hr-ponto","treinamentos","boletos","contratos"]},"caixa":{"write":["caixa","chat","boletos","nfse"],"read":["agenda","clientes","dashboard","fluxo","orcamentos","recepcao","cartao-beneficios","painel","consulta-rapida","procedimentos","planos","hr-ponto","treinamentos","financeiro","relatorios","contratos"]},"medico":{"write":["chat","documentos","atendimento-ia","odontologia","prontuarios","anamneses","exames-resultados"],"read":["agenda","clientes","dashboard","triagem-enfermagem","consulta-rapida","prontuario-modelos","hr-ponto","hr-ferias","hr-holerites","treinamentos"]},"enfermeiro":{"write":["chat","triagem-enfermagem","alertas-enfermagem","anamneses"],"read":["agenda","checkin","clientes","dashboard","fluxo","documentos","consulta-rapida","prontuarios","exames-resultados","estoque","hr-ponto","treinamentos"]},"financeiro":{"write":["chat","cartao-beneficios","financeiro","relatorios","boletos","contratos","nfse"],"read":["agenda","caixa","clientes","dashboard","fluxo","orcamentos","procedimentos","planos","hr-ponto","hr-contratos","hr-holerites","treinamentos","auditoria","painel-executivo"]}}'::jsonb;
  i int;
BEGIN
  IF _clinica_id IS NULL THEN
    RAISE EXCEPTION 'clinica_id obrigatorio';
  END IF;

  -- 1) Perfis de acesso padrao
  FOR i IN 1 .. array_length(_perfis, 1) LOOP
    INSERT INTO public.perfis_acesso (clinica_id, chave, nome, descricao, sistema, ativo)
    VALUES (_clinica_id, _perfis[i][1], _perfis[i][2], _perfis[i][3], true, true)
    ON CONFLICT (clinica_id, chave) DO NOTHING;
  END LOOP;

  -- 2) Matriz de permissoes padrao da plataforma (write/read explicitos, resto = none)
  INSERT INTO public.perfil_permissoes (perfil_id, modulo, acesso)
  SELECT pa.id, m.modulo,
         CASE WHEN _matriz->pa.chave->'write' ? m.modulo THEN 'write'
              WHEN _matriz->pa.chave->'read'  ? m.modulo THEN 'read'
              ELSE 'none' END::public.modulo_acesso
  FROM public.perfis_acesso pa
  CROSS JOIN unnest(_modulos) AS m(modulo)
  WHERE pa.clinica_id = _clinica_id AND _matriz ? pa.chave
  ON CONFLICT (perfil_id, modulo) DO NOTHING;

  -- 3) Feature flags padrao (todas desligadas)
  INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo)
  SELECT _clinica_id, f, false
  FROM unnest(ARRAY[
    'agenda_v2_disabled','atendimento_multiplo_disabled','caixa_misto_estruturado',
    'hiperdia','menu_hover_scale','nina_desativada','novo_layout_agenda',
    'permissoes_financeiro_granular','turbo_mode_agenda_disabled','ux_melhorias'
  ]) AS f
  ON CONFLICT (clinica_id, flag_key) DO NOTHING;

  -- 4) Modelos de prontuario padrao
  PERFORM public.seed_prontuario_modelos_padrao(_clinica_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.seed_clinica_padrao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_clinica_padrao(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.criar_clinica_com_admin(_nome text, _cnpj text DEFAULT NULL::text, _telefone text DEFAULT NULL::text, _cidade text DEFAULT NULL::text, _estado text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
  _clinica_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF _nome IS NULL OR length(trim(_nome)) < 2 OR length(_nome) > 200 THEN
    RAISE EXCEPTION 'Nome inválido (2-200 caracteres)';
  END IF;
  IF _cnpj IS NOT NULL AND length(_cnpj) > 20 THEN
    RAISE EXCEPTION 'CNPJ inválido';
  END IF;
  IF _telefone IS NOT NULL AND length(_telefone) > 30 THEN
    RAISE EXCEPTION 'Telefone inválido';
  END IF;
  IF _estado IS NOT NULL AND length(_estado) <> 2 THEN
    RAISE EXCEPTION 'UF deve ter 2 caracteres';
  END IF;

  INSERT INTO public.clinicas (nome, cnpj, telefone, cidade, estado)
  VALUES (trim(_nome), _cnpj, _telefone, _cidade, _estado)
  RETURNING id INTO _clinica_id;

  INSERT INTO public.clinica_memberships (user_id, clinica_id, role, ativo)
  VALUES (_user_id, _clinica_id, 'admin', true)
  ON CONFLICT DO NOTHING;

  -- Infraestrutura minima: perfis, permissoes, feature flags e modelos de prontuario.
  PERFORM public.seed_clinica_padrao(_clinica_id);

  RETURN _clinica_id;
END;
$function$;

-- Retroativo: apenas infraestrutura minima para POLICLINICA SAO FRANCISCO DE PAULA
-- Executa no contexto do admin da propria clinica (seed_prontuario_modelos_padrao exige membro).
DO $do$
DECLARE
  _admin uuid;
BEGIN
  SELECT user_id INTO _admin
  FROM public.clinica_memberships
  WHERE clinica_id = '1d3c4f34-2a0f-40fa-b39a-3609677a11a5'::uuid AND ativo AND role = 'admin'
  LIMIT 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', _admin)::text, true);
  PERFORM public.seed_clinica_padrao('1d3c4f34-2a0f-40fa-b39a-3609677a11a5'::uuid);
  PERFORM set_config('request.jwt.claims', NULL, true);
END
$do$;