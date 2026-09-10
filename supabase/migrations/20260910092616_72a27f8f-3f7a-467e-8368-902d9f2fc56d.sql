-- REAGENDAMENTO PASSA A LEVAR TODO O VÍNCULO FINANCEIRO DO PACIENTE
-- A função reagendar_atendimento rodava com a permissão de quem clicou; a
-- policy fin_lanc_update só deixa admin/gestor/financeiro/caixa alterar
-- recebimentos, então quando a RECEPÇÃO reagendava, o pagamento ficava preso
-- na ficha antiga em silêncio. Agora: SECURITY DEFINER com checagem de perfil
-- (mesma lista da policy agend_update), e recebimentos, NFS-e, estornos,
-- itens de orçamento e marcações financeiras acompanham o paciente. Nada é
-- criado nem estornado no financeiro: o mesmo registro troca de ficha.

-- Trava de alçada do "sem faturamento" reconhece o reagendamento: a isenção
-- já autorizada só muda de ficha junto com o paciente. O sinal
-- app.reagendamento_em_curso só é ligado dentro de reagendar_atendimento.
CREATE OR REPLACE FUNCTION public.fn_sem_faturamento_exige_motivo_e_alcada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- OLD não existe em INSERT: lê-lo no DECLARE derrubaria todo cadastro novo
  -- de agendamento com "record old is not assigned yet".
  v_antes boolean;
  v_depois boolean := COALESCE(NEW.sem_faturamento, false);
  v_uid uuid := auth.uid();
  v_tem_alcada boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_antes := false;
  ELSE
    v_antes := COALESCE(OLD.sem_faturamento, false);
  END IF;

  -- A marcação não mudou: nada a validar.
  IF v_antes IS NOT DISTINCT FROM v_depois THEN
    RETURN NEW;
  END IF;

  -- Reagendamento: a isenção já autorizada só está mudando de ficha junto com
  -- o paciente (ver reagendar_atendimento).
  IF COALESCE(current_setting('app.reagendamento_em_curso', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF v_depois AND COALESCE(LENGTH(BTRIM(NEW.sem_faturamento_motivo)), 0) < 4 THEN
    RAISE EXCEPTION
      'Para marcar um atendimento como SEM FATURAMENTO é obrigatório informar o motivo da isenção.';
  END IF;

  -- Rotina do sistema, sem usuário logado (importação, edge function): segue.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_tem_alcada := public.has_any_role(
    _user_id => v_uid,
    _clinica_id => NEW.clinica_id,
    _roles => ARRAY['admin', 'gestor', 'supervisor']::public.app_role[]
  );

  -- Quem não tem alçada só passa se um supervisor tiver autorizado na hora —
  -- é o caminho da recepcionista que pediu a senha na tela.
  IF NOT v_tem_alcada THEN
    IF NEW.sem_faturamento_autorizado_por IS NULL
       OR NOT public.has_any_role(
            _user_id => NEW.sem_faturamento_autorizado_por,
            _clinica_id => NEW.clinica_id,
            _roles => ARRAY['admin', 'gestor', 'supervisor']::public.app_role[]
          )
    THEN
      RAISE EXCEPTION
        'Marcar ou remover SEM FATURAMENTO é uma ação restrita à supervisão (administrador, gestor ou supervisor). Peça a autorização na tela da Agenda.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.reagendar_atendimento(
  _origem_id  uuid,
  _destino_id uuid,
  _trilha_msg text,
  _motivo     text DEFAULT NULL
)
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

-- Função com privilégio do dono: nunca pode ficar aberta para visitante.
REVOKE ALL ON FUNCTION public.reagendar_atendimento(uuid, uuid, text, text) FROM public;
REVOKE ALL ON FUNCTION public.reagendar_atendimento(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reagendar_atendimento(uuid, uuid, text, text) TO authenticated;