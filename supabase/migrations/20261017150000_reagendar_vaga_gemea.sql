-- Reagendar falhava com "Já existe um registro com esses dados." (17/10/2026,
-- Menino Jesus, reagendamento de ficha do Dr. Alex Louza Macedo para a
-- Dra. Rosangela Schmitz Riolino).
--
-- Causa: no passo 1 a ficha de ORIGEM volta a ser vaga livre. Quando já existe
-- outra vaga livre no mesmo (clínica, médico, agenda, horário) — a "vaga gêmea"
-- que ficou embaixo do paciente —, o índice único parcial `uq_agend_slot_vazio`
-- recusa a segunda vaga livre e o banco devolve o código 23505, que a tela
-- traduz como "Já existe um registro com esses dados.". Havia 35 fichas nessa
-- situação em 17/10/2026.
--
-- Correção (mesma regra do "Desmarcar" da Agenda): antes do passo 1, apaga a
-- vaga gêmea e a ficha de origem volta à grade no lugar dela — nunca o
-- contrário. Só apaga vaga LIMPA: sem paciente, status agendado e sem nenhum
-- registro ligado (pagamento, nota, prontuário, orçamento, confirmação…). As
-- chaves estrangeiras de fin_lancamentos/nfse/prontuarios são SET NULL, então
-- apagar uma vaga com rastro soltaria esse registro sem aviso; nesse caso o
-- reagendamento para com uma mensagem clara em vez de apagar.
--
-- O resto da função é idêntico à versão em produção em 17/10/2026.

CREATE OR REPLACE FUNCTION public.reagendar_atendimento(_origem_id uuid, _destino_id uuid, _trilha_msg text, _motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_origem    public.agendamentos%rowtype;
  v_destino   public.agendamentos%rowtype;
  v_motivo    text := nullif(btrim(coalesce(_motivo, '')), '');
  v_novas_obs text;
  v_lancs     integer := 0;
  v_notas     integer := 0;
  v_gemea     uuid;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente para reagendar.';
  end if;

  if _origem_id = _destino_id then
    raise exception 'Esse já é o horário atual.';
  end if;

  select * into v_origem from agendamentos where id = _origem_id for update;
  if not found then
    raise exception 'Agendamento de origem não encontrado.';
  end if;

  select * into v_destino from agendamentos where id = _destino_id for update;
  if not found then
    raise exception 'Horário de destino não encontrado.';
  end if;

  if v_origem.clinica_id is distinct from v_destino.clinica_id then
    raise exception 'O horário escolhido pertence a outra clínica.';
  end if;

  -- Esta função roda com privilégio do dono para conseguir levar o pagamento
  -- mesmo quando quem reagenda é a recepção. Por isso a permissão é conferida
  -- aqui, com a MESMA lista de perfis da policy agend_update.
  if not public.has_any_role(
       auth.uid(), v_origem.clinica_id,
       array['admin','gestor','supervisor','recepcao','caixa','medico','enfermeiro']::public.app_role[]
     ) then
    raise exception 'Seu perfil não tem permissão para reagendar nesta clínica.';
  end if;

  if lower(btrim(coalesce(v_origem.paciente_nome, ''))) in ('disponível', 'disponivel', 'bloqueio', '') then
    raise exception 'Não há paciente neste horário para reagendar.';
  end if;

  -- Mesma trava da tela: atendimento realizado só se reagenda depois do estorno.
  if v_origem.status = 'realizado' then
    raise exception 'Atendimento já realizado — peça ao financeiro para estornar antes de reagendar.';
  end if;

  -- Bloqueia reagendar para cima de slot ocupado.
  -- IMPORTANTE: NÃO reutilizar errcode 23505 aqui — o frontend traduz esse
  -- código como "Já existe um registro com esses dados". O RAISE padrão
  -- (P0001) mostra a mensagem real ao usuário.
  if lower(btrim(coalesce(v_destino.paciente_nome, ''))) not in ('disponível', 'disponivel', 'bloqueio') then
    raise exception 'Esse horário já está ocupado por %. Escolha um horário livre (DISPONÍVEL).', v_destino.paciente_nome;
  end if;

  -- 0) Vaga gêmea: vaga livre no MESMO lugar da origem (clínica, médico,
  --    agenda e horário). Com ela lá, a origem não pode voltar a ser vaga
  --    livre (índice uq_agend_slot_vazio). O destino escolhido ser a própria
  --    gêmea significa ficar no mesmo horário.
  select t.id into v_gemea
    from agendamentos t
   where t.clinica_id = v_origem.clinica_id
     and t.medico_id  = v_origem.medico_id
     and t.agenda_id  = v_origem.agenda_id
     and t.inicio     = v_origem.inicio
     and t.paciente_id is null
     and t.status = 'agendado'
     and t.id <> _origem_id
   limit 1
   for update;

  if v_gemea is not null then
    if v_gemea = _destino_id then
      raise exception 'Esse já é o horário atual.';
    end if;
    if exists (select 1 from fin_lancamentos                x where x.agendamento_id = v_gemea)
       or exists (select 1 from fin_atendimentos            x where x.agendamento_id = v_gemea)
       or exists (select 1 from nfse                        x where x.agendamento_id = v_gemea)
       or exists (select 1 from nfse_agendamentos           x where x.agendamento_id = v_gemea)
       or exists (select 1 from prontuarios                 x where x.agendamento_id = v_gemea)
       or exists (select 1 from anamnese_respostas          x where x.agendamento_id = v_gemea)
       or exists (select 1 from orcamento_itens             x where x.agendamento_id = v_gemea)
       or exists (select 1 from agendamento_orcamento_itens x where x.agendamento_id = v_gemea)
       or exists (select 1 from agendamento_confirmacoes    x where x.agendamento_id = v_gemea)
       or exists (select 1 from odonto_evolucoes            x where x.agendamento_id = v_gemea)
       or exists (select 1 from fisio_sessoes               x where x.agendamento_id = v_gemea)
       or exists (select 1 from pedidos_exame               x where x.agendamento_id = v_gemea)
       or exists (select 1 from estorno_solicitacoes        x where x.agendamento_id = v_gemea)
    then
      raise exception 'O horário antigo tem uma vaga livre repetida com registros ligados a ela, e por isso não pode ser liberado. Peça ao gestor para conferir esse horário antes de reagendar.';
    end if;
    delete from agendamentos where id = v_gemea;
  end if;

  v_novas_obs := case
    when coalesce(v_origem.observacoes, '') <> '' then v_origem.observacoes || E'\n' || _trilha_msg
    else _trilha_msg
  end;

  -- Liga o sinal que a trava de "sem faturamento" reconhece: nas duas
  -- atualizações abaixo a isenção só muda de ficha. Desligado logo depois.
  perform set_config('app.reagendamento_em_curso', 'on', true);

  -- 1) Origem volta a ser vaga limpa. Precisa vir ANTES do destino por causa
  --    do índice único de orcamento_item_id.
  update agendamentos set
    paciente_id = null,
    paciente_nome = 'DISPONÍVEL',
    status = 'agendado',
    procedimento = null,
    observacoes = null,
    data_pagamento = null,
    tipo_atendimento = 'particular',
    orcamento_id = null,
    orcamento_item_id = null,
    pacote_id = null,
    atendimento_grupo_id = null,
    forma_pagamento_prevista = null,
    valor_cobranca = null,
    sem_faturamento = false,
    sem_faturamento_em = null,
    sem_faturamento_por = null,
    sem_faturamento_por_nome = null,
    sem_faturamento_motivo = null,
    sem_faturamento_autorizado_por = null,
    sem_faturamento_autorizado_por_nome = null,
    convenio_autorizado = false,
    convenio_autorizado_em = null,
    convenio_autorizado_por = null,
    origem_externa = false,
    origem_clinica_id = null,
    origem_clinica_nome = null,
    origem_gr_numero = null,
    origem_valor = null,
    -- Slot liberado não herda a justificativa do paciente que saiu.
    cancelamento_motivo = null,
    cancelamento_em = null,
    cancelamento_por = null,
    reagendamento_motivo = null,
    reagendamento_em = null,
    reagendamento_por = null
  where id = _origem_id;

  -- 2) Destino recebe o paciente com todas as marcações financeiras dele.
  update agendamentos set
    paciente_id = v_origem.paciente_id,
    paciente_nome = v_origem.paciente_nome,
    procedimento = coalesce(v_origem.procedimento, v_destino.procedimento),
    status = 'agendado',
    observacoes = v_novas_obs,
    data_pagamento = v_origem.data_pagamento,
    tipo_atendimento = v_origem.tipo_atendimento,
    orcamento_id = v_origem.orcamento_id,
    orcamento_item_id = v_origem.orcamento_item_id,
    pacote_id = v_origem.pacote_id,
    atendimento_grupo_id = v_origem.atendimento_grupo_id,
    forma_pagamento_prevista = v_origem.forma_pagamento_prevista,
    valor_cobranca = v_origem.valor_cobranca,
    sem_faturamento = v_origem.sem_faturamento,
    sem_faturamento_em = v_origem.sem_faturamento_em,
    sem_faturamento_por = v_origem.sem_faturamento_por,
    sem_faturamento_por_nome = v_origem.sem_faturamento_por_nome,
    sem_faturamento_motivo = v_origem.sem_faturamento_motivo,
    sem_faturamento_autorizado_por = v_origem.sem_faturamento_autorizado_por,
    sem_faturamento_autorizado_por_nome = v_origem.sem_faturamento_autorizado_por_nome,
    convenio_autorizado = v_origem.convenio_autorizado,
    convenio_autorizado_em = v_origem.convenio_autorizado_em,
    convenio_autorizado_por = v_origem.convenio_autorizado_por,
    origem_externa = v_origem.origem_externa,
    origem_clinica_id = v_origem.origem_clinica_id,
    origem_clinica_nome = v_origem.origem_clinica_nome,
    origem_gr_numero = v_origem.origem_gr_numero,
    origem_valor = v_origem.origem_valor,
    reagendamento_motivo = v_motivo,
    reagendamento_em = case when v_motivo is null then null else now() end,
    reagendamento_por = case when v_motivo is null then null else auth.uid() end
  where id = _destino_id;

  perform set_config('app.reagendamento_em_curso', 'off', true);

  -- 3) Recebimentos: o MESMO registro troca de ficha (nada é criado, nada é
  --    estornado). O médico só é trocado no recebimento do profissional
  --    principal — a fatia de um segundo profissional continua com ele.
  update fin_lancamentos set
    agendamento_id = _destino_id,
    medico_id = case
      when medico_id is null or medico_id = v_origem.medico_id then v_destino.medico_id
      else medico_id
    end,
    paciente_id = coalesce(v_origem.paciente_id, paciente_id)
  where agendamento_id = _origem_id;
  get diagnostics v_lancs = row_count;

  -- 4) Notas fiscais (vínculo direto e agrupado) — sem isso a ficha nova
  --    aparece sem nota e a recepção emitiria uma segunda.
  update nfse set agendamento_id = _destino_id where agendamento_id = _origem_id;
  get diagnostics v_notas = row_count;
  update nfse_agendamentos set agendamento_id = _destino_id where agendamento_id = _origem_id;

  -- 5) Demais vínculos financeiros do atendimento.
  update fin_atendimentos           set agendamento_id = _destino_id where agendamento_id = _origem_id;
  update estorno_solicitacoes       set agendamento_id = _destino_id where agendamento_id = _origem_id;
  update orcamento_itens            set agendamento_id = _destino_id where agendamento_id = _origem_id;
  update agendamento_orcamento_itens set agendamento_id = _destino_id where agendamento_id = _origem_id;

  return jsonb_build_object(
    'origem_id', _origem_id,
    'destino_id', _destino_id,
    'pagamentos_movidos', v_lancs,
    'notas_movidas', v_notas
  );
end;
$function$;
