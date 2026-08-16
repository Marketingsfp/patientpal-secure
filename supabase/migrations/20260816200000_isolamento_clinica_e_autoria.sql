-- ============================================================================
-- Isolamento entre clínicas + autoria verdadeira no caixa.
--
-- CONTEXTO: auditei o corpo das funções SECURITY DEFINER (que ignoram o RLS
-- por definição). A grande maioria está correta. O defeito encontrado sempre
-- teve a mesma forma:
--
--   a função confere "você pertence à clínica do CONTRATO/MÉDICO/FUNCIONÁRIO",
--   e em seguida usa um `paciente_id` recebido de quem chamou SEM conferir
--   que aquele paciente também é da mesma clínica.
--
-- Aparece em: hr_convenio_add_dependente, medico_convenio_add_dependente,
-- hr_toggle_convenio_funcionario, medico_toggle_convenio_funcionario,
-- emitir_senha, renovar_contrato_extensao, renovar_contrato_troca_plano e
-- trocar_convenio_contrato.
--
-- POR QUE GATILHO, E NÃO REESCREVER AS OITO: reescrever oito funções de 150 a
-- 250 linhas para enfiar um IF em cada uma é muito mais arriscado do que
-- declarar a regra uma vez no banco — e o gatilho vale também para qualquer
-- função nova que alguém escreva amanhã. As funções continuam exatamente como
-- estão; o banco é que passa a recusar o vínculo inválido.
--
-- VERIFICADO ANTES DE CRIAR: zero linhas violam a regra hoje, nas quatro
-- tabelas afetadas. Portanto nada que já existe passa a falhar.
--
-- Também nesta migration:
--   * agenda_slot_unlock ganha a checagem de clínica que a irmã
--     agenda_slot_lock já tinha (era o único ponto que faltava).
--   * fn_registrar_lancamento_e_caixa para de aceitar de quem chama QUEM foi
--     o autor do lançamento e de quem é o caixa. Conferi os 5 pontos de
--     chamada no app: todos já mandam o próprio usuário logado, então na
--     prática nada muda — só deixa de ser possível lançar dinheiro no caixa
--     de outra pessoa forjando o parâmetro.
--
-- Reversível: o SQL para voltar atrás está no fim do arquivo.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- PARTE 1 — a regra: um paciente só se vincula a registros da própria clínica
-- ---------------------------------------------------------------------------

-- Para tabelas que têm clinica_id na própria linha.
create or replace function public.fn_paciente_mesma_clinica()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_clinica_paciente uuid;
BEGIN
  IF NEW.paciente_id IS NULL OR NEW.clinica_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT clinica_id INTO v_clinica_paciente
    FROM public.pacientes WHERE id = NEW.paciente_id;

  IF v_clinica_paciente IS NULL THEN
    RAISE EXCEPTION 'Paciente % não existe.', NEW.paciente_id
      USING errcode = '23503';
  END IF;

  IF v_clinica_paciente <> NEW.clinica_id THEN
    RAISE EXCEPTION
      'Paciente pertence a outra clínica — vínculo recusado (tabela %).', TG_TABLE_NAME
      USING errcode = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

drop trigger if exists trg_senhas_paciente_mesma_clinica on public.senhas;
create trigger trg_senhas_paciente_mesma_clinica
  before insert or update of paciente_id, clinica_id on public.senhas
  for each row execute function public.fn_paciente_mesma_clinica();

drop trigger if exists trg_contratos_paciente_mesma_clinica on public.contratos_assinatura;
create trigger trg_contratos_paciente_mesma_clinica
  before insert or update of paciente_id, clinica_id on public.contratos_assinatura
  for each row execute function public.fn_paciente_mesma_clinica();

-- `contrato_dependentes` não carrega a clínica na linha: ela vem do contrato.
create or replace function public.fn_dependente_mesma_clinica()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_clinica_contrato uuid;
  v_clinica_paciente uuid;
BEGIN
  IF NEW.paciente_id IS NULL OR NEW.contrato_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT clinica_id INTO v_clinica_contrato
    FROM public.contratos_assinatura WHERE id = NEW.contrato_id;
  SELECT clinica_id INTO v_clinica_paciente
    FROM public.pacientes WHERE id = NEW.paciente_id;

  IF v_clinica_contrato IS NULL OR v_clinica_paciente IS NULL THEN
    RETURN NEW;  -- contrato ou paciente inexistente: a FK cuida disso
  END IF;

  IF v_clinica_contrato <> v_clinica_paciente THEN
    RAISE EXCEPTION 'Dependente pertence a outra clínica — vínculo recusado.'
      USING errcode = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

drop trigger if exists trg_dependentes_mesma_clinica on public.contrato_dependentes;
create trigger trg_dependentes_mesma_clinica
  before insert or update of paciente_id, contrato_id on public.contrato_dependentes
  for each row execute function public.fn_dependente_mesma_clinica();

-- Lançamento financeiro: além do paciente, o médico e o agendamento citados
-- também precisam ser da mesma clínica do lançamento.
create or replace function public.fn_lancamento_mesma_clinica()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_c uuid;
BEGIN
  IF NEW.clinica_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.paciente_id IS NOT NULL THEN
    SELECT clinica_id INTO v_c FROM public.pacientes WHERE id = NEW.paciente_id;
    IF v_c IS NOT NULL AND v_c <> NEW.clinica_id THEN
      RAISE EXCEPTION 'Paciente pertence a outra clínica.' USING errcode = '42501';
    END IF;
  END IF;

  IF NEW.medico_id IS NOT NULL THEN
    SELECT clinica_id INTO v_c FROM public.medicos WHERE id = NEW.medico_id;
    IF v_c IS NOT NULL AND v_c <> NEW.clinica_id THEN
      RAISE EXCEPTION 'Médico pertence a outra clínica.' USING errcode = '42501';
    END IF;
  END IF;

  IF NEW.agendamento_id IS NOT NULL THEN
    SELECT clinica_id INTO v_c FROM public.agendamentos WHERE id = NEW.agendamento_id;
    IF v_c IS NOT NULL AND v_c <> NEW.clinica_id THEN
      RAISE EXCEPTION 'Agendamento pertence a outra clínica.' USING errcode = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

drop trigger if exists trg_fin_lancamentos_mesma_clinica on public.fin_lancamentos;
create trigger trg_fin_lancamentos_mesma_clinica
  before insert or update of paciente_id, medico_id, agendamento_id, clinica_id
  on public.fin_lancamentos
  for each row execute function public.fn_lancamento_mesma_clinica();

-- ---------------------------------------------------------------------------
-- PARTE 2 — agenda_slot_unlock: a checagem de clínica que faltava
--
-- Espelha exatamente o que agenda_slot_lock já fazia. A condição original
-- (só destrava se a trava for sua ou não existir) é mantida.
-- ---------------------------------------------------------------------------
create or replace function public.agenda_slot_unlock(_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  _uid uuid := auth.uid();
  _clinica_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT clinica_id INTO _clinica_id FROM public.agendamentos WHERE id = _id;
  IF _clinica_id IS NULL THEN
    RETURN;  -- agendamento inexistente: nada a destravar
  END IF;

  IF NOT public.is_member(_uid, _clinica_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.agendamentos
     SET edit_lock_by = NULL,
         edit_lock_by_nome = NULL,
         edit_lock_at = NULL
   WHERE id = _id AND (edit_lock_by IS NULL OR edit_lock_by = _uid);
END;
$function$;

-- ---------------------------------------------------------------------------
-- PARTE 3 — fn_registrar_lancamento_e_caixa: autoria vem da sessão
--
-- Antes, `criado_por` e o dono do caixa (`p_movimento.user_id`) vinham do
-- corpo da requisição, então dava para registrar dinheiro no caixa de outra
-- pessoa. Agora ambos são auth.uid(). O nome exibido é buscado no cadastro,
-- caindo para o que veio na requisição só se o perfil não tiver nome.
--
-- Todo o resto do corpo é idêntico ao que estava em produção.
-- ---------------------------------------------------------------------------
create or replace function public.fn_registrar_lancamento_e_caixa(
  p_lancamento jsonb,
  p_movimento jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_clinica_id   uuid;
  v_user_id      uuid;
  v_user_nome    text;
  v_lanc_id      uuid;
  v_mov_id       uuid;
  v_sess_id      uuid;
  v_sess_criada  boolean := false;
  v_data_lanc    date;
  v_hoje         date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_retroativo   boolean := false;
  v_valor_mov    numeric;
  v_ts_mov       timestamptz;
  v_forcar_hoje  boolean := true;
BEGIN
  IF p_lancamento IS NULL THEN
    RAISE EXCEPTION 'p_lancamento é obrigatório';
  END IF;

  v_clinica_id := (p_lancamento->>'clinica_id')::uuid;

  IF auth.uid() IS NULL OR NOT public.is_member(auth.uid(), v_clinica_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'clinica_id é obrigatório';
  END IF;

  v_data_lanc := COALESCE((p_lancamento->>'data')::date, v_hoje);
  v_retroativo := v_data_lanc < v_hoje;

  INSERT INTO public.fin_lancamentos (
    clinica_id, tipo, descricao, valor, data, status,
    categoria_id, conta_id, forma_pagamento, bandeira_cartao, parcelas,
    emitir_nfse, observacoes, agendamento_id, medico_id, paciente_id, criado_por,
    composicao_pagamento
  )
  VALUES (
    v_clinica_id,
    (p_lancamento->>'tipo')::public.fin_tipo_lancamento,
    p_lancamento->>'descricao',
    (p_lancamento->>'valor')::numeric,
    v_data_lanc,
    COALESCE(p_lancamento->>'status', 'confirmado')::public.fin_status_lancamento,
    NULLIF(p_lancamento->>'categoria_id','')::uuid,
    NULLIF(p_lancamento->>'conta_id','')::uuid,
    p_lancamento->>'forma_pagamento',
    p_lancamento->>'bandeira_cartao',
    NULLIF(p_lancamento->>'parcelas','')::int,
    COALESCE((p_lancamento->>'emitir_nfse')::boolean, false),
    p_lancamento->>'observacoes',
    NULLIF(p_lancamento->>'agendamento_id','')::uuid,
    NULLIF(p_lancamento->>'medico_id','')::uuid,
    NULLIF(p_lancamento->>'paciente_id','')::uuid,
    auth.uid(),   -- ALTERADO: era NULLIF(p_lancamento->>'criado_por','')::uuid
    CASE WHEN jsonb_typeof(p_lancamento->'composicao_pagamento') = 'object'
      THEN p_lancamento->'composicao_pagamento' ELSE NULL END
  )
  RETURNING id INTO v_lanc_id;

  IF p_movimento IS NOT NULL AND p_movimento::text <> 'null' THEN
    -- ALTERADO: o dono do caixa é sempre quem está logado.
    v_user_id   := auth.uid();
    v_user_nome := COALESCE(
      (SELECT NULLIF(pr.nome, '') FROM public.profiles pr WHERE pr.id = auth.uid()),
      p_movimento->>'user_nome'
    );
    v_valor_mov := (p_movimento->>'valor')::numeric;

    IF (p_movimento ? 'forcar_sessao_hoje') THEN
      v_forcar_hoje := COALESCE((p_movimento->>'forcar_sessao_hoje')::boolean, true);
    END IF;

    IF (NOT v_retroativo) OR v_forcar_hoje THEN
      SELECT id INTO v_sess_id
      FROM public.caixa_sessoes
      WHERE clinica_id = v_clinica_id
        AND user_id    = v_user_id
        AND status     = 'aberto'::public.caixa_sessao_status
        AND (aberto_em AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje
      ORDER BY aberto_em DESC
      LIMIT 1;

      IF v_sess_id IS NULL THEN
        INSERT INTO public.caixa_sessoes (
          clinica_id, user_id, user_nome, valor_abertura, status, observacoes
        )
        VALUES (
          v_clinica_id, v_user_id, v_user_nome, 0,
          'aberto'::public.caixa_sessao_status,
          'Aberto automaticamente pelo sistema'
        )
        RETURNING id INTO v_sess_id;

        v_sess_criada := true;

        INSERT INTO public.caixa_movimentos (
          sessao_id, clinica_id, user_id, tipo, valor, descricao
        )
        VALUES (
          v_sess_id, v_clinica_id, v_user_id,
          'abertura'::public.caixa_mov_tipo, 0, 'Abertura automática'
        );
      END IF;

      v_ts_mov := now();
    ELSE
      DECLARE
        v_sess_status  public.caixa_sessao_status;
        v_sess_infor   numeric;
        v_sess_calc    numeric;
        v_sess_obs     text;
      BEGIN
        SELECT id, status, valor_fechamento_informado, valor_fechamento_calculado, observacoes
          INTO v_sess_id, v_sess_status, v_sess_infor, v_sess_calc, v_sess_obs
        FROM public.caixa_sessoes
        WHERE clinica_id = v_clinica_id
          AND user_id    = v_user_id
          AND ((aberto_em AT TIME ZONE 'America/Sao_Paulo')::date <= v_data_lanc AND
                (fechado_em IS NULL OR (fechado_em AT TIME ZONE 'America/Sao_Paulo')::date >= v_data_lanc))
        ORDER BY aberto_em DESC
        LIMIT 1;

        v_ts_mov := (v_data_lanc::text || ' 12:00:00-03')::timestamptz;

        IF v_sess_id IS NULL THEN
          INSERT INTO public.caixa_sessoes (
            clinica_id, user_id, user_nome, aberto_em, valor_abertura,
            status, fechado_em, valor_fechamento_informado,
            valor_fechamento_calculado, diferenca, observacoes
          )
          VALUES (
            v_clinica_id, v_user_id, v_user_nome, v_ts_mov, 0,
            'fechado'::public.caixa_sessao_status, v_ts_mov,
            v_valor_mov, v_valor_mov, 0,
            format('[Sessão retroativa gerada em %s por lançamento com data %s: +R$ %s]',
              to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
              to_char(v_data_lanc, 'DD/MM/YYYY'),
              to_char(v_valor_mov, 'FM999G999G990D00'))
          )
          RETURNING id INTO v_sess_id;
          v_sess_criada := true;
        ELSIF v_sess_status = 'fechado'::public.caixa_sessao_status THEN
          UPDATE public.caixa_sessoes
          SET valor_fechamento_calculado = COALESCE(v_sess_calc, 0) + v_valor_mov,
              diferenca = COALESCE(v_sess_infor, 0) - (COALESCE(v_sess_calc, 0) + v_valor_mov),
              observacoes = COALESCE(v_sess_obs || ' | ', '') || format(
                '[Retroativo lançado em %s por %s: +R$ %s]',
                to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
                COALESCE(v_user_nome, v_user_id::text),
                to_char(v_valor_mov, 'FM999G999G990D00')),
              updated_at = now()
          WHERE id = v_sess_id;
        END IF;
      END;
    END IF;

    INSERT INTO public.caixa_movimentos (
      sessao_id, clinica_id, user_id, tipo, valor, descricao,
      forma_pagamento, lancamento_id, created_at
    )
    VALUES (
      v_sess_id, v_clinica_id, v_user_id,
      (p_movimento->>'tipo')::public.caixa_mov_tipo,
      v_valor_mov,
      CASE WHEN v_retroativo
        THEN (p_movimento->>'descricao') || format(' [Data retroativa: %s]', to_char(v_data_lanc, 'DD/MM/YYYY'))
        ELSE p_movimento->>'descricao'
      END,
      p_movimento->>'forma_pagamento',
      v_lanc_id,
      v_ts_mov
    )
    RETURNING id INTO v_mov_id;
  END IF;

  RETURN jsonb_build_object(
    'lancamento_id', v_lanc_id,
    'movimento_id',  v_mov_id,
    'sessao_id',     v_sess_id,
    'sessao_criada', v_sess_criada,
    'retroativo',    v_retroativo
  );
END;
$function$;

commit;

-- ============================================================================
-- CONFERÊNCIA (rode depois)
--
-- 1) Os quatro gatilhos existem? Deve devolver 4 linhas.
--
--   select tgname, tgrelid::regclass as tabela
--     from pg_trigger
--    where tgname in ('trg_senhas_paciente_mesma_clinica',
--                     'trg_contratos_paciente_mesma_clinica',
--                     'trg_dependentes_mesma_clinica',
--                     'trg_fin_lancamentos_mesma_clinica');
--
-- 2) agenda_slot_unlock passou a checar a clínica? Deve devolver true.
--
--   select pg_get_functiondef(oid) ~ 'is_member'
--     from pg_proc where proname = 'agenda_slot_unlock';
--
-- 3) O caixa parou de aceitar autor vindo do cliente? Deve devolver false.
--
--   select pg_get_functiondef(oid) ~ 'criado_por'''
--     from pg_proc where proname = 'fn_registrar_lancamento_e_caixa';
-- ============================================================================

-- ============================================================================
-- PARA VOLTAR ATRÁS (descomente e rode)
--
-- begin;
-- drop trigger if exists trg_senhas_paciente_mesma_clinica on public.senhas;
-- drop trigger if exists trg_contratos_paciente_mesma_clinica on public.contratos_assinatura;
-- drop trigger if exists trg_dependentes_mesma_clinica on public.contrato_dependentes;
-- drop trigger if exists trg_fin_lancamentos_mesma_clinica on public.fin_lancamentos;
-- drop function if exists public.fn_paciente_mesma_clinica();
-- drop function if exists public.fn_dependente_mesma_clinica();
-- drop function if exists public.fn_lancamento_mesma_clinica();
--
-- -- agenda_slot_unlock volta à versão sem checagem:
-- create or replace function public.agenda_slot_unlock(_id uuid)
-- returns void language plpgsql security definer set search_path to 'public'
-- as $restore$
-- DECLARE _uid uuid := auth.uid();
-- BEGIN
--   UPDATE public.agendamentos
--      SET edit_lock_by = NULL, edit_lock_by_nome = NULL, edit_lock_at = NULL
--    WHERE id = _id AND (edit_lock_by IS NULL OR edit_lock_by = _uid);
-- END;
-- $restore$;
--
-- -- Para fn_registrar_lancamento_e_caixa, troque no corpo acima:
-- --   auth.uid()   -->  NULLIF(p_lancamento->>'criado_por','')::uuid
-- --   v_user_id := auth.uid()  -->  v_user_id := (p_movimento->>'user_id')::uuid
-- -- e rode o arquivo de novo. O resto do corpo é idêntico.
-- commit;
-- ============================================================================
