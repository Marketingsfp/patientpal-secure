-- ============================================================================
-- DESFAZER BAIXA E ESTORNO DE REPASSE (Financeiro -> Atendimentos)
-- Data: 2026-09-04
-- Rodar inteiro no SQL editor do Lovable Cloud. Nao apaga dado nenhum sozinho:
-- so cria/atualiza duas funcoes e ajusta as permissoes de execucao delas.
-- ----------------------------------------------------------------------------
-- POR QUE ESTE ARQUIVO EXISTE
--
-- 1) O botao "Desfazer baixa" nao funcionava para o pessoal do Financeiro.
--    A tela mandava um UPDATE direto na tabela `agendamentos`, e a politica
--    de seguranca `agend_update` libera esse UPDATE para admin, gestor,
--    supervisor, recepcao, caixa, medico e enfermeiro -- o perfil
--    `financeiro` NAO esta na lista. Quando a politica barra, o Postgres nao
--    devolve erro: ele simplesmente nao altera nenhuma linha. Por isso a tela
--    mostrava "Baixa desfeita." e nada acontecia -- o famoso "o botao nao
--    responde".
--
--    A correcao NAO amplia a politica (isso daria ao Financeiro poder de
--    editar qualquer campo de qualquer agendamento). Em vez disso, a acao
--    passa a rodar dentro de uma funcao SECURITY DEFINER que faz
--    exatamente uma coisa: voltar o status de 'realizado' para 'confirmado'.
--
-- 2) A mesma tela apagava o "lancamento-sombra" de R$ 0,00 com um DELETE
--    direto em `fin_lancamentos`. A politica `fin_lanc_delete` so aceita
--    admin/gestor. Para o Financeiro esse DELETE tambem falhava em silencio,
--    deixando lixo de R$ 0,00 para tras. Agora vai por dentro da funcao.
--
-- 3) Nao existia nenhuma forma de voltar um atendimento com repasse "Pago"
--    para "A receber". Passa a existir a funcao `estornar_repasse_atendimento`,
--    que desfaz o pagamento do repasse, desvincula o comprovante (a despesa de
--    repasse) e devolve o item para "A receber".
--
-- AUDITORIA: as duas funcoes gravam uma linha propria em `audit_log`
-- (acao DESFAZER_BAIXA / ESTORNO_REPASSE) com usuario, e-mail, data/hora e
-- motivo. Nos atendimentos vindos da agenda tambem entra uma nota no
-- historico do agendamento, que a recepcao/financeiro le na tela da Agenda.
-- Os gatilhos de auditoria que ja existiam continuam gravando o antes/depois
-- linha a linha, como sempre.
--
-- CAIXA: a despesa de repasse NUNCA entra em caixa_movimentos (conferido em
-- producao: zero linhas). Entao estornar repasse nao mexe em gaveta de caixa
-- nenhuma, nem aberta nem fechada. O pagamento do PACIENTE tambem nao e
-- tocado por nenhuma das duas funcoes -- ele e trilha separada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ETAPA 0 - Liberar as duas novas acoes na tabela de auditoria
-- ----------------------------------------------------------------------------
-- A tabela `audit_log` tem uma trava (audit_log_action_check) que so aceita
-- uma lista fechada de nomes de acao. Sem incluir os dois nomes novos, o
-- INSERT da auditoria seria recusado e derrubaria a operacao inteira junto.
-- A lista antiga e mantida integralmente; so entram os dois nomes novos.
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (
  action = any (array[
    'INSERT','UPDATE','DELETE',
    'blocked_UPDATE','blocked_DELETE',
    'merge_pacientes','excluir_paciente_duplicado',
    'DESFAZER_BAIXA','ESTORNO_REPASSE'
  ])
  or action like 'NINA\_%'
  or action like 'AI\_%'
);

-- ----------------------------------------------------------------------------
-- ETAPA 1 - Desfazer a baixa (volta de 'Realizado' para 'Confirmado')
-- ----------------------------------------------------------------------------
create or replace function public.desfazer_baixa_atendimento(
  _clinica_id uuid,
  _origem     text,
  _id         uuid,
  _motivo     text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid          uuid := auth.uid();
  v_email        text;
  v_nome         text;
  v_ag           uuid;
  v_ag_status    text;
  v_status       text;
  v_pago         boolean;
  v_lanc         uuid;
  v_sombras      uuid[] := '{}'::uuid[];
  v_tabela       text;
  v_registro     text;
  v_motivo       text := nullif(btrim(coalesce(_motivo, '')), '');
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre no sistema novamente para desfazer a baixa.'
      using errcode = '42501';
  end if;

  -- Mesmo conjunto de perfis que ja podia editar atendimentos no financeiro.
  if not public.has_any_role(
       v_uid, _clinica_id,
       array['admin','gestor','supervisor','financeiro','caixa']::app_role[]
     ) then
    raise exception 'Seu perfil não tem permissão para desfazer a baixa de atendimentos.'
      using errcode = '42501';
  end if;

  if _origem not in ('agenda','manual') then
    raise exception 'Origem inválida do atendimento: %', coalesce(_origem,'(nula)')
      using errcode = '22023';
  end if;

  begin
    select u.email, nullif(btrim(coalesce(u.raw_user_meta_data->>'nome','')), '')
      into v_email, v_nome
      from auth.users u
     where u.id = v_uid;
  exception when others then
    v_email := null; v_nome := null;
  end;

  -- ---------------------------------------------------------------- AGENDA --
  if _origem = 'agenda' then
    select fl.agendamento_id, fl.repasse_pago
      into v_ag, v_pago
      from fin_lancamentos fl
     where fl.id = _id
       and fl.clinica_id = _clinica_id
     for update;

    if not found then
      raise exception 'Atendimento não encontrado nesta clínica.' using errcode = 'P0002';
    end if;
    if coalesce(v_pago, false) then
      raise exception 'Repasse já foi pago para este atendimento. Estorne o repasse antes de desfazer a baixa.'
        using errcode = 'P0001';
    end if;
    if v_ag is null then
      raise exception 'Atendimento sem agendamento vinculado — não há baixa de agenda para desfazer.'
        using errcode = 'P0001';
    end if;

    select ag.status::text
      into v_ag_status
      from agendamentos ag
     where ag.id = v_ag
       and ag.clinica_id = _clinica_id
     for update;

    if v_ag_status is null then
      raise exception 'Agendamento não encontrado nesta clínica.' using errcode = 'P0002';
    end if;

    if v_ag_status <> 'realizado' then
      return jsonb_build_object(
        'ok', true, 'ja_desfeito', true, 'status', v_ag_status,
        'sombras_removidas', 0
      );
    end if;

    update agendamentos
       set status = 'confirmado'::agendamento_status
     where id = v_ag;

    -- Lancamento-sombra de R$ 0,00 ("sem cobranca"). Pagamento de verdade
    -- (valor > 0) NUNCA e apagado aqui.
    with d as (
      delete from fin_lancamentos
       where agendamento_id = v_ag
         and clinica_id = _clinica_id
         and tipo = 'receita'::fin_tipo_lancamento
         and coalesce(valor, 0) = 0
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_sombras from d;

    v_tabela   := 'agendamentos';
    v_registro := v_ag::text;

  -- ---------------------------------------------------------------- MANUAL --
  else
    select fa.status, fa.repasse_pago, fa.lancamento_id
      into v_status, v_pago, v_lanc
      from fin_atendimentos fa
     where fa.id = _id
       and fa.clinica_id = _clinica_id
     for update;

    if not found then
      raise exception 'Atendimento não encontrado nesta clínica.' using errcode = 'P0002';
    end if;
    if coalesce(v_pago, false) then
      raise exception 'Repasse já foi pago para este atendimento. Estorne o repasse antes de desfazer a baixa.'
        using errcode = 'P0001';
    end if;

    if coalesce(v_status,'') <> 'realizado' then
      return jsonb_build_object(
        'ok', true, 'ja_desfeito', true, 'status', v_status,
        'sombras_removidas', 0
      );
    end if;

    update fin_atendimentos
       set status = 'confirmado'
     where id = _id;

    if v_lanc is not null then
      with d as (
        delete from fin_lancamentos
         where id = v_lanc
           and clinica_id = _clinica_id
           and tipo = 'receita'::fin_tipo_lancamento
           and coalesce(valor, 0) = 0
        returning id
      )
      select coalesce(array_agg(id), '{}'::uuid[]) into v_sombras from d;
    end if;

    v_tabela   := 'fin_atendimentos';
    v_registro := _id::text;
  end if;

  -- ------------------------------------------------------------- AUDITORIA --
  insert into audit_log (
    user_id, user_email, clinica_id, table_name, record_id, action,
    dados_antes, dados_depois
  ) values (
    v_uid, v_email, _clinica_id, v_tabela, v_registro, 'DESFAZER_BAIXA',
    jsonb_build_object('status', 'realizado'),
    jsonb_build_object(
      'status', 'confirmado',
      'origem', _origem,
      'atendimento_id', _id,
      'motivo', v_motivo,
      'lancamentos_sombra_removidos', to_jsonb(v_sombras)
    )
  );

  if _origem = 'agenda' and v_ag is not null then
    begin
      insert into agendamento_historico_notas (
        clinica_id, agendamento_id, user_email, user_nome, texto
      ) values (
        _clinica_id, v_ag, v_email, v_nome,
        -- a tabela limita o texto a 1000 caracteres
        left(
          'BAIXA DESFEITA: o atendimento voltou para Confirmado no Financeiro.'
          || case when v_motivo is null then '' else ' Motivo: ' || v_motivo || '.' end,
          1000
        )
      );
    exception when others then
      null; -- a nota e registro secundario; a auditoria principal ja foi gravada
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'ja_desfeito', false,
    'status', 'confirmado',
    'sombras_removidas', coalesce(array_length(v_sombras, 1), 0)
  );
end;
$function$;

revoke execute on function public.desfazer_baixa_atendimento(uuid,text,uuid,text) from public;
revoke execute on function public.desfazer_baixa_atendimento(uuid,text,uuid,text) from anon;
grant  execute on function public.desfazer_baixa_atendimento(uuid,text,uuid,text) to authenticated;


-- ----------------------------------------------------------------------------
-- ETAPA 2 - Estornar o repasse (volta de 'Pago' para 'A receber')
-- ----------------------------------------------------------------------------
-- O que faz, em ordem, tudo dentro de UMA transacao:
--   1. confere o perfil (admin, gestor ou financeiro) e exige motivo;
--   2. desfaz o repasse do terceiro (dono do equipamento) deste atendimento,
--      abatendo a despesa dele -- e apagando a despesa se ela ficar sem item;
--   3. limpa as marcas de repasse pago do atendimento e desvincula o
--      comprovante (repasse_lancamento_id);
--   4. abate o valor do atendimento na despesa de repasse do medico. Se aquele
--      atendimento era o ultimo da despesa, a despesa e apagada; se sobraram
--      outros, o valor e a contagem "(N atend.)" da descricao sao corrigidos.
--   5. grava auditoria e nota no historico do agendamento.
-- O pagamento do PACIENTE e o caixa nao sao tocados.
create or replace function public.estornar_repasse_atendimento(
  _clinica_id    uuid,
  _origem        text,
  _id            uuid,
  _valor_medico  numeric default null,
  _motivo        text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid             uuid := auth.uid();
  v_email           text;
  v_nome            text;
  v_motivo          text := nullif(btrim(coalesce(_motivo, '')), '');
  v_pago            boolean;
  v_desp            uuid;
  v_pago_em         date;
  v_pago_at         timestamptz;
  v_forma           text;
  v_conta           uuid;
  v_ag              uuid;
  v_tabela          text;
  v_registro        text;
  v_abate           numeric;
  v_abate_conhecido boolean;
  v_restantes       integer := 0;
  v_valor_desp      numeric;
  v_desc_desp       text;
  v_novo_valor      numeric;
  v_desp_apagada    boolean := false;
  v_terceiros       integer := 0;
  v_t               record;
  v_rest_t          integer;
  v_valor_t         numeric;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre no sistema novamente para estornar o repasse.'
      using errcode = '42501';
  end if;

  -- Estorno de repasse ja pago e acao restrita: Financeiro e Administração.
  if not public.has_any_role(
       v_uid, _clinica_id,
       array['admin','gestor','financeiro']::app_role[]
     ) then
    raise exception 'Somente os perfis Financeiro e Administrador podem estornar um repasse já pago.'
      using errcode = '42501';
  end if;

  if _origem not in ('agenda','manual') then
    raise exception 'Origem inválida do atendimento: %', coalesce(_origem,'(nula)')
      using errcode = '22023';
  end if;

  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'Informe o motivo do estorno do repasse.' using errcode = '22023';
  end if;

  begin
    select u.email, nullif(btrim(coalesce(u.raw_user_meta_data->>'nome','')), '')
      into v_email, v_nome
      from auth.users u
     where u.id = v_uid;
  exception when others then
    v_email := null; v_nome := null;
  end;

  -- ------------------------------------------------- trava e le a linha ----
  if _origem = 'agenda' then
    select fl.repasse_pago, fl.repasse_lancamento_id, fl.repasse_pago_em,
           fl.repasse_pago_at, fl.repasse_forma_pagamento, fl.repasse_conta_id,
           fl.agendamento_id,
           coalesce(_valor_medico, fl.valor_medico_override)
      into v_pago, v_desp, v_pago_em, v_pago_at, v_forma, v_conta, v_ag, v_abate
      from fin_lancamentos fl
     where fl.id = _id
       and fl.clinica_id = _clinica_id
     for update;
    v_tabela := 'fin_lancamentos';
  else
    select fa.repasse_pago, fa.repasse_lancamento_id, fa.repasse_pago_em,
           fa.repasse_pago_at, fa.repasse_forma_pagamento, fa.repasse_conta_id,
           null::uuid,
           coalesce(_valor_medico, fa.valor_medico)
      into v_pago, v_desp, v_pago_em, v_pago_at, v_forma, v_conta, v_ag, v_abate
      from fin_atendimentos fa
     where fa.id = _id
       and fa.clinica_id = _clinica_id
     for update;
    v_tabela := 'fin_atendimentos';
  end if;

  if not found then
    raise exception 'Atendimento não encontrado nesta clínica.' using errcode = 'P0002';
  end if;
  if not coalesce(v_pago, false) then
    return jsonb_build_object('ok', true, 'ja_estornado', true);
  end if;

  v_abate_conhecido := v_abate is not null;
  v_abate := round(coalesce(v_abate, 0), 2);
  v_registro := _id::text;

  -- ------------------------------------- repasse do terceiro (se houver) ----
  for v_t in
    select frt.id, frt.valor, frt.repasse_lancamento_id
      from fin_repasse_terceiro frt
     where frt.clinica_id = _clinica_id
       and coalesce(frt.repasse_pago, true) = true
       and ((_origem = 'agenda' and frt.lancamento_id   = _id)
         or (_origem = 'manual' and frt.atendimento_id = _id))
     for update
  loop
    delete from fin_repasse_terceiro where id = v_t.id;
    v_terceiros := v_terceiros + 1;

    if v_t.repasse_lancamento_id is not null then
      select count(*) into v_rest_t
        from fin_repasse_terceiro frt2
       where frt2.repasse_lancamento_id = v_t.repasse_lancamento_id;

      if v_rest_t = 0 then
        delete from fin_lancamentos
         where id = v_t.repasse_lancamento_id
           and clinica_id = _clinica_id;
      else
        select fl.valor into v_valor_t
          from fin_lancamentos fl
         where fl.id = v_t.repasse_lancamento_id
           and fl.clinica_id = _clinica_id
         for update;
        if v_valor_t is not null then
          update fin_lancamentos
             set valor = greatest(0, round(v_valor_t - round(coalesce(v_t.valor, 0), 2), 2)),
                 descricao = regexp_replace(
                   coalesce(descricao, ''), '\(\s*\d+\s*ATEND\.?\s*\)',
                   '(' || v_rest_t || ' ATEND.)', 'i')
           where id = v_t.repasse_lancamento_id;
        end if;
      end if;
    end if;
  end loop;

  -- ------------------------------------ limpa as marcas de repasse pago ----
  if _origem = 'agenda' then
    update fin_lancamentos
       set repasse_pago = false,
           repasse_pago_em = null,
           repasse_pago_at = null,
           repasse_forma_pagamento = null,
           repasse_conta_id = null,
           repasse_pago_por = null,
           repasse_lancamento_id = null
     where id = _id;
  else
    update fin_atendimentos
       set repasse_pago = false,
           repasse_pago_em = null,
           repasse_pago_at = null,
           repasse_forma_pagamento = null,
           repasse_conta_id = null,
           repasse_pago_por = null,
           repasse_lancamento_id = null
     where id = _id;
  end if;

  -- ------------------------------- acerta a despesa (o comprovante pago) ----
  if v_desp is not null then
    select
      (select count(*) from fin_lancamentos  l where l.repasse_lancamento_id = v_desp)
    + (select count(*) from fin_atendimentos a where a.repasse_lancamento_id = v_desp)
      into v_restantes;

    if v_restantes = 0 then
      delete from fin_lancamentos
       where id = v_desp
         and clinica_id = _clinica_id;
      v_desp_apagada := true;
    else
      select fl.valor, fl.descricao
        into v_valor_desp, v_desc_desp
        from fin_lancamentos fl
       where fl.id = v_desp
         and fl.clinica_id = _clinica_id
       for update;

      if v_valor_desp is not null then
        v_novo_valor := greatest(0, round(v_valor_desp - v_abate, 2));
        update fin_lancamentos
           set valor = v_novo_valor,
               descricao = regexp_replace(
                 coalesce(v_desc_desp, ''), '\(\s*\d+\s*ATEND\.?\s*\)',
                 '(' || v_restantes || ' ATEND.)', 'i')
         where id = v_desp;
      end if;
    end if;
  end if;

  -- ------------------------------------------------------------ AUDITORIA ---
  insert into audit_log (
    user_id, user_email, clinica_id, table_name, record_id, action,
    dados_antes, dados_depois
  ) values (
    v_uid, v_email, _clinica_id, v_tabela, v_registro, 'ESTORNO_REPASSE',
    jsonb_build_object(
      'repasse_pago', true,
      'repasse_pago_em', v_pago_em,
      'repasse_pago_at', v_pago_at,
      'repasse_forma_pagamento', v_forma,
      'repasse_conta_id', v_conta,
      'repasse_lancamento_id', v_desp
    ),
    jsonb_build_object(
      'repasse_pago', false,
      'origem', _origem,
      'motivo', v_motivo,
      'valor_abatido', case when v_abate_conhecido then v_abate else null end,
      'despesa_apagada', v_desp_apagada,
      'atendimentos_restantes_na_despesa', v_restantes,
      'repasses_terceiro_estornados', v_terceiros
    )
  );

  if _origem = 'agenda' and v_ag is not null then
    begin
      insert into agendamento_historico_notas (
        clinica_id, agendamento_id, user_email, user_nome, texto
      ) values (
        _clinica_id, v_ag, v_email, v_nome,
        -- a tabela limita o texto a 1000 caracteres
        left(
          'REPASSE ESTORNADO: o repasse deste atendimento voltou para A RECEBER. Motivo: '
          || v_motivo || '.',
          1000
        )
      );
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'ja_estornado', false,
    'despesa_apagada', v_desp_apagada,
    'atendimentos_restantes_na_despesa', v_restantes,
    'valor_abatido', case when v_abate_conhecido then v_abate else null end,
    'valor_desconhecido', not v_abate_conhecido,
    'repasses_terceiro_estornados', v_terceiros
  );
end;
$function$;

revoke execute on function public.estornar_repasse_atendimento(uuid,text,uuid,numeric,text) from public;
revoke execute on function public.estornar_repasse_atendimento(uuid,text,uuid,numeric,text) from anon;
grant  execute on function public.estornar_repasse_atendimento(uuid,text,uuid,numeric,text) to authenticated;


-- ----------------------------------------------------------------------------
-- ETAPA 3 - Conferencia (so leitura). Deve devolver as duas funcoes.
-- ----------------------------------------------------------------------------
select p.proname, p.prosecdef as security_definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('desfazer_baixa_atendimento', 'estornar_repasse_atendimento')
 order by 1;
