-- ============================================================================
-- Move para o BANCO a permissão de quatro funções que hoje só são protegidas
-- pela tela. Todas são SECURITY DEFINER (ignoram o RLS por definição) e
-- nenhuma verificava vínculo, papel ou módulo — bastava estar logado.
--
--   1. estornar_sangria ............. qualquer um dos 51 usuários podia
--                                     estornar uma sangria, o que CRIA um
--                                     lançamento de entrada no caixa
--   2. fin_atendimentos_matriz ...... devolvia o faturamento mensal da clínica
--   3. log_action ................... deixava gravar entradas arbitrárias no
--                                     log de auditoria de qualquer clínica
--   4. paciente_pendencias_cadastro . dizia quais campos faltam no cadastro de
--                                     um paciente qualquer, por ID
--
-- CHAVE DE MÓDULO USADA — verificado em perfil_permissoes antes de escrever:
-- as chaves granulares ('financeiro-estorno', 'financeiro-movcaixa') NÃO
-- existem no banco; só existem 'financeiro' e 'caixa'. A tela de estorno
-- (/app/financeiro/estorno) já cai no módulo 'financeiro' pelo mapa de
-- fallback em src/lib/permissoes-rotas.ts:167. Por isso a trava aqui é
-- 'financeiro' — reproduz exatamente quem consegue hoje.
--
-- QUEM CONTINUA CONSEGUINDO estornar (financeiro = write):
--   admin (33 usuários), gestor (1), financeiro (2) = 36 pessoas
-- QUEM PASSA A SER BARRADO:
--   recepção (6), médico (2), enfermeiro (1) — e o perfil caixa (5), que já
--   não alcançava a tela de estorno hoje, porque tem financeiro = none.
--   Se a clínica quiser que o caixa faça estorno, o caminho é conceder o
--   módulo 'financeiro' a esse perfil na tela de Perfis de Acesso — e não
--   afrouxar esta função.
--
-- `log_action` NÃO recebe trava de módulo de propósito: ela é chamada por
-- todo o CRUD do sistema (src/hooks/use-crud.tsx:106). Exigir um módulo ali
-- quebraria o registro de auditoria do app inteiro. A correção certa para ela
-- é só impedir que alguém grave no log de uma clínica à qual não pertence.
--
-- Fica de fora desta migration, de propósito: `agenda_slot_unlock`. Ela também
-- não checa a clínica, mas só limpa uma trava de edição que já esteja livre ou
-- que seja do próprio usuário — impacto muito baixo, e prefiro não ampliar o
-- escopo combinado sem você saber.
--
-- Reversível: o SQL para voltar atrás está comentado no fim do arquivo.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. estornar_sangria — exige vínculo ativo + módulo financeiro com escrita
-- ---------------------------------------------------------------------------
create or replace function public.estornar_sangria(
  _movimento_id uuid,
  _clinica_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_mov              public.caixa_movimentos%ROWTYPE;
  v_sessao_status    text;
  v_sessao_alvo      uuid;
  v_aviso            text := NULL;
  v_user             uuid := auth.uid();
  v_novo_id          uuid;
  v_ja_estornado     boolean;
  v_desc_estorno     text;
BEGIN
  PERFORM set_config('app.actor_source', 'estornar_sangria', true);
  IF v_user IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  SELECT * INTO v_mov FROM public.caixa_movimentos WHERE id = _movimento_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrado', 'mensagem', 'Movimento de caixa não encontrado.'); END IF;
  IF _clinica_id IS NOT NULL AND v_mov.clinica_id <> _clinica_id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'clinica_divergente', 'mensagem', 'Movimento pertence a outra clínica.');
  END IF;

  -- ===== AUTORIZAÇÃO (novo) ===============================================
  -- Conferida contra a clínica REAL do movimento (v_mov.clinica_id), nunca
  -- contra o parâmetro — que é opcional e vem de quem chama.
  IF NOT EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.user_id = v_user AND m.clinica_id = v_mov.clinica_id AND m.ativo = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_acesso',
      'mensagem', 'Você não tem acesso a esta clínica.');
  END IF;

  IF NOT public.has_module_access(v_user, v_mov.clinica_id, 'financeiro', 'write') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao',
      'mensagem', 'Você não tem permissão para estornar sangria (módulo financeiro).');
  END IF;
  -- ========================================================================

  IF v_mov.tipo <> 'sangria' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tipo_invalido', 'mensagem', 'Este movimento não é uma sangria.');
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.caixa_movimentos WHERE tipo = 'suprimento' AND clinica_id = v_mov.clinica_id AND descricao LIKE ('[ESTORNO DE SANGRIA #' || v_mov.id::text || ']%')) INTO v_ja_estornado;
  IF v_ja_estornado THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_estornado', 'mensagem', 'Esta sangria já foi estornada anteriormente.');
  END IF;
  SELECT status INTO v_sessao_status FROM public.caixa_sessoes WHERE id = v_mov.sessao_id;
  IF v_sessao_status = 'aberto' THEN
    v_sessao_alvo := v_mov.sessao_id;
  ELSE
    SELECT id INTO v_sessao_alvo FROM public.caixa_sessoes WHERE clinica_id = v_mov.clinica_id AND user_id = v_user AND status = 'aberto' ORDER BY aberto_em DESC LIMIT 1;
    IF v_sessao_alvo IS NULL THEN
      SELECT id INTO v_sessao_alvo FROM public.caixa_sessoes WHERE clinica_id = v_mov.clinica_id AND status = 'aberto' ORDER BY aberto_em DESC LIMIT 1;
    END IF;
    IF v_sessao_alvo IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'sem_sessao_aberta', 'mensagem', 'Sessão original fechada e não há caixa aberto para lançar a compensação. Abra um caixa e tente novamente.');
    END IF;
    v_aviso := 'lancado_em_sessao_atual';
  END IF;
  v_desc_estorno := '[ESTORNO DE SANGRIA #' || v_mov.id::text || '] ' || COALESCE(v_mov.descricao, 'Sangria');
  INSERT INTO public.caixa_movimentos (sessao_id, clinica_id, user_id, tipo, valor, descricao, forma_pagamento, destino_user_id, destino_nome)
  VALUES (v_sessao_alvo, v_mov.clinica_id, v_user, 'suprimento', v_mov.valor, v_desc_estorno, v_mov.forma_pagamento, v_mov.destino_user_id, v_mov.destino_nome)
  RETURNING id INTO v_novo_id;
  BEGIN
    INSERT INTO public.audit_log (clinica_id, user_id, action, table_name, record_id, dados_antes, dados_depois)
    VALUES (v_mov.clinica_id, v_user, 'ESTORNO_SANGRIA', 'caixa_movimentos', v_mov.id::text, to_jsonb(v_mov), jsonb_build_object('novo_movimento_id', v_novo_id, 'sessao_alvo', v_sessao_alvo));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object('ok', true, 'novo_movimento_id', v_novo_id, 'sessao_alvo', v_sessao_alvo, 'aviso', v_aviso);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. fin_atendimentos_matriz — exige módulo financeiro (leitura)
--
-- É uma função SQL pura: a trava entra no WHERE. Quem não tem o módulo
-- recebe zero linhas, que é como o gráfico já se comporta quando não há dados.
-- ---------------------------------------------------------------------------
create or replace function public.fin_atendimentos_matriz(_clinica uuid)
returns table(ano integer, mes integer, cartao bigint, particular bigint, exames bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  WITH cls AS (
    SELECT
      EXTRACT(YEAR FROM data)::int AS ano,
      EXTRACT(MONTH FROM data)::int - 1 AS mes,
      CASE
        WHEN UPPER(descricao) LIKE '%ADESAO%' OR UPPER(descricao) LIKE '%ADESÃO%' THEN NULL
        WHEN UPPER(descricao) LIKE '%CARTAO CONSULTA + SEGUROS%' OR UPPER(descricao) LIKE '%CARTÃO CONSULTA%' THEN NULL
        WHEN UPPER(descricao) LIKE '%CARTAO BENEFICIOS%' OR UPPER(descricao) LIKE '%CARTÃO BENEFÍCIOS%' THEN NULL
        WHEN UPPER(descricao) LIKE '%CONSULTA CARTAO%' OR UPPER(descricao) LIKE '%CONSULTA CARTÃO%' THEN 'cartao'
        WHEN UPPER(descricao) LIKE '%EXAME CARTAO%' OR UPPER(descricao) LIKE '%EXAME CARTÃO%' THEN 'exame'
        WHEN UPPER(descricao) LIKE '%CONTRATO%' THEN 'particular'
        WHEN UPPER(descricao) LIKE '%CONSULTA%' THEN 'particular'
        ELSE 'exame'
      END AS cat
    FROM public.fin_lancamentos
    WHERE clinica_id = _clinica
      AND tipo = 'receita'
      AND status <> 'cancelado'
      AND data IS NOT NULL
      -- AUTORIZAÇÃO (novo): sem o módulo financeiro, nenhuma linha entra.
      AND public.has_module_access(auth.uid(), _clinica, 'financeiro', 'read')
  )
  SELECT ano, mes,
    COUNT(*) FILTER (WHERE cat = 'cartao')::bigint AS cartao,
    COUNT(*) FILTER (WHERE cat = 'particular')::bigint AS particular,
    COUNT(*) FILTER (WHERE cat = 'exame')::bigint AS exames
  FROM cls
  WHERE cat IS NOT NULL
  GROUP BY ano, mes
  ORDER BY ano, mes;
$function$;

-- ---------------------------------------------------------------------------
-- 3. log_action — impede gravar no log de auditoria de outra clínica
--
-- Sem trava de módulo (ver cabeçalho). Quando a clínica não é informada, o
-- registro continua sendo aceito: o user_id gravado vem sempre da sessão
-- (auth.uid()), então não há como se passar por outra pessoa de qualquer jeito.
-- ---------------------------------------------------------------------------
create or replace function public.log_action(
  _table_name text,
  _record_id text,
  _action text,
  _clinica_id uuid default null::uuid,
  _dados_antes jsonb default null::jsonb,
  _dados_depois jsonb default null::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  _email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  -- AUTORIZAÇÃO (novo): se a clínica foi informada, precisa ser uma da qual
  -- o usuário participa.
  IF _clinica_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.user_id = auth.uid() AND m.clinica_id = _clinica_id AND m.ativo = true
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta clínica.' USING errcode = '42501';
  END IF;

  BEGIN
    SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  EXCEPTION WHEN OTHERS THEN _email := NULL; END;

  INSERT INTO public.audit_log
    (user_id, user_email, clinica_id, table_name, record_id, action, dados_antes, dados_depois)
  VALUES
    (auth.uid(), _email, _clinica_id, _table_name, _record_id, _action, _dados_antes, _dados_depois);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. paciente_pendencias_cadastro — exige vínculo com a clínica do paciente
--
-- Continua funcionando quando chamada por dentro de paciente_resumo_recepcao:
-- `auth.uid()` é o usuário da sessão e não muda ao entrar numa função
-- SECURITY DEFINER, e aquela função já exige o mesmo vínculo antes de chamar
-- esta aqui.
-- ---------------------------------------------------------------------------
create or replace function public.paciente_pendencias_cadastro(_paciente_id uuid)
returns table(contato_ok boolean, documentacao_ok boolean, endereco_ok boolean, nfse_ok boolean, faltantes text[])
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  p public.pacientes%ROWTYPE;
  falt text[] := ARRAY[]::text[];
  v_contato boolean;
  v_doc boolean;
  v_end boolean;
  v_nfse boolean;
BEGIN
  SELECT * INTO p FROM public.pacientes WHERE id = _paciente_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, false, false, ARRAY['paciente_nao_encontrado']::text[];
    RETURN;
  END IF;

  -- AUTORIZAÇÃO (novo): só quem pertence à clínica do paciente.
  -- Devolve a mesma resposta de "não encontrado" de propósito: não confirma a
  -- existência de um paciente de outra clínica para quem não deveria vê-lo.
  IF NOT EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.user_id = auth.uid() AND m.clinica_id = p.clinica_id AND m.ativo = true
  ) THEN
    RETURN QUERY SELECT false, false, false, false, ARRAY['paciente_nao_encontrado']::text[];
    RETURN;
  END IF;

  IF p.telefone IS NULL OR length(regexp_replace(coalesce(p.telefone,''),'\D','','g')) < 10 THEN
    falt := array_append(falt,'telefone');
  END IF;
  v_contato := NOT ('telefone' = ANY(falt));

  IF p.cpf IS NULL OR length(regexp_replace(coalesce(p.cpf,''),'\D','','g')) <> 11 THEN
    falt := array_append(falt,'cpf');
  END IF;
  IF p.data_nascimento IS NULL THEN
    falt := array_append(falt,'data_nascimento');
  END IF;
  v_doc := NOT ('cpf' = ANY(falt) OR 'data_nascimento' = ANY(falt));

  IF p.cep IS NULL OR length(regexp_replace(coalesce(p.cep,''),'\D','','g')) <> 8 THEN
    falt := array_append(falt,'cep');
  END IF;
  IF coalesce(trim(p.logradouro),'') = '' THEN falt := array_append(falt,'logradouro'); END IF;
  IF coalesce(trim(p.numero),'') = '' THEN falt := array_append(falt,'numero'); END IF;
  IF coalesce(trim(p.bairro),'') = '' THEN falt := array_append(falt,'bairro'); END IF;
  IF coalesce(trim(p.cidade),'') = '' THEN falt := array_append(falt,'cidade'); END IF;
  IF coalesce(trim(p.estado),'') = '' THEN falt := array_append(falt,'estado'); END IF;
  v_end := NOT (('cep' = ANY(falt)) OR ('logradouro' = ANY(falt)) OR ('numero' = ANY(falt))
                OR ('bairro' = ANY(falt)) OR ('cidade' = ANY(falt)) OR ('estado' = ANY(falt)));

  IF coalesce(trim(p.email),'') = '' THEN
    falt := array_append(falt,'email');
  END IF;
  v_nfse := v_contato AND v_doc AND v_end AND NOT ('email' = ANY(falt));

  RETURN QUERY SELECT v_contato, v_doc, v_end, v_nfse, falt;
END;
$function$;

commit;

-- ============================================================================
-- CONFERÊNCIA (rode depois)
--
-- 1) As quatro funções passaram a citar a checagem de permissão?
--    Deve devolver 4 linhas, todas com tem_checagem = true.
--
--   select p.proname,
--          pg_get_functiondef(p.oid) ~ 'clinica_memberships|has_module_access' as tem_checagem
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('estornar_sangria','fin_atendimentos_matriz',
--                        'log_action','paciente_pendencias_cadastro');
--
-- 2) Quantas pessoas continuam podendo estornar (esperado: 36):
--
--   select count(*) from public.clinica_memberships m
--    where m.ativo
--      and public.has_module_access(m.user_id, m.clinica_id, 'financeiro', 'write');
-- ============================================================================

-- ============================================================================
-- PARA VOLTAR ATRÁS
--
-- Reverter significa recolocar as versões SEM checagem de permissão. Se
-- precisar, o caminho seguro é restaurar cada função a partir da definição
-- anterior, que está registrada na revisão deste arquivo no git:
--
--   git show HEAD~1 -- supabase/migrations/  (antes desta migration existir)
--
-- Ou, mais direto: remover apenas os blocos marcados com "AUTORIZAÇÃO (novo)"
-- de cada uma das quatro funções acima e rodar o arquivo de novo. Nada mais
-- foi alterado — o resto do corpo é idêntico ao que estava em produção.
-- ============================================================================
