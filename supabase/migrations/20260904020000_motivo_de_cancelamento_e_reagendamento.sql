-- ============================================================================
-- MOTIVO OBRIGATÓRIO DE CANCELAMENTO E REAGENDAMENTO
-- ============================================================================
--
-- Até aqui, cancelar ou reagendar um atendimento não gravava justificativa
-- nenhuma em lugar nenhum. A janela de Histórico conseguia mostrar QUEM
-- desmarcou e de qual status/horário, mas nunca o PORQUÊ — e a coordenação
-- não tinha como cobrar a recepção.
--
-- O motivo é gravado em colunas do próprio agendamento, e não numa tabela
-- nova, por dois motivos:
--
--   1. a gravação acontece no MESMO UPDATE que muda o status ou o horário,
--      então o gatilho de auditoria já registra o motivo dentro do
--      `dados_depois` daquela linha. O histórico exibe a justificativa colada
--      no evento certo, sem precisar cruzar tabelas;
--   2. as colunas sobrevivem à limpeza de 180 dias do `audit_log`, então uma
--      ficha antiga continua provando quem desmarcou e por quê.
--
-- Só o nome de quem agiu não é guardado aqui: `*_por` guarda o id do usuário
-- e a função `agendamento_historico` resolve o nome na hora de exibir, o que
-- evita nome desatualizado quando alguém troca de cadastro.
--
-- Nenhuma trava é criada no banco. A obrigatoriedade é aplicada nas telas —
-- uma exceção de banco no meio do atendimento derrubaria o balcão, e existem
-- caminhos legítimos sem motivo (cancelamento em cascata de orçamento,
-- integração externa, manutenção).
-- ============================================================================

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS cancelamento_motivo   text,
  ADD COLUMN IF NOT EXISTS cancelamento_em       timestamptz,
  ADD COLUMN IF NOT EXISTS cancelamento_por      uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reagendamento_motivo  text,
  ADD COLUMN IF NOT EXISTS reagendamento_em      timestamptz,
  ADD COLUMN IF NOT EXISTS reagendamento_por     uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.agendamentos.cancelamento_motivo IS
  'Justificativa informada no momento do cancelamento. Obrigatória nas telas de Agenda.';
COMMENT ON COLUMN public.agendamentos.reagendamento_motivo IS
  'Justificativa do último reagendamento. Sobrescrita a cada novo reagendamento; o histórico guarda a sequência completa via audit_log.';


-- ----------------------------------------------------------------------------
-- reagendar_atendimento — passa a receber o motivo
-- ----------------------------------------------------------------------------
-- Esta RPC é a usada pela Agenda clássica (individual e em lote). Ela move o
-- PACIENTE de um registro para outro: a origem volta a ser DISPONÍVEL e o
-- destino passa a carregar o paciente. Por isso a justificativa é gravada no
-- registro de DESTINO — é ele que segue a vida do atendimento e é nele que a
-- supervisão vai abrir o histórico.
--
-- A origem, que vira slot livre, tem as marcações zeradas: um horário
-- disponível não pode carregar o motivo do paciente anterior.
--
-- A assinatura antiga (3 argumentos) é removida de propósito. Mantê-la ao
-- lado da nova deixaria a chamada de 3 argumentos ambígua para o Postgres.
DROP FUNCTION IF EXISTS public.reagendar_atendimento(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.reagendar_atendimento(
  _origem_id  uuid,
  _destino_id uuid,
  _trilha_msg text,
  _motivo     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  v_origem record;
  v_destino record;
  v_novo_procedimento text;
  v_novas_obs text;
begin
  if _origem_id = _destino_id then
    raise exception 'Esse já é o horário atual.';
  end if;

  select id, paciente_id, paciente_nome, procedimento, observacoes, data_pagamento
  into v_origem
  from agendamentos
  where id = _origem_id
  for update;
  if v_origem.id is null then
    raise exception 'Agendamento de origem não encontrado.';
  end if;

  select id, paciente_nome, procedimento, medico_id
  into v_destino
  from agendamentos
  where id = _destino_id
  for update;
  if v_destino.id is null then
    raise exception 'Horário de destino não encontrado.';
  end if;

  -- Bloqueia reagendar para cima de slot ocupado.
  -- IMPORTANTE: NÃO reutilizar errcode 23505 aqui — o frontend traduz esse
  -- código como "Já existe um registro com esses dados", o que confunde
  -- o operador. Deixamos o RAISE padrão (P0001) para a mensagem real
  -- ser exibida ao usuário.
  if lower(trim(v_destino.paciente_nome)) not in ('disponível', 'disponivel', 'bloqueio') then
    raise exception 'Esse horário já está ocupado por %. Escolha um horário livre (DISPONÍVEL).', v_destino.paciente_nome;
  end if;

  v_novo_procedimento := coalesce(v_origem.procedimento, v_destino.procedimento);
  v_novas_obs := case
    when v_origem.observacoes is not null and v_origem.observacoes <> ''
      then v_origem.observacoes || E'\n' || _trilha_msg
    else _trilha_msg
  end;

  update agendamentos set
    paciente_id = null,
    paciente_nome = 'DISPONÍVEL',
    status = 'agendado',
    procedimento = null,
    observacoes = null,
    data_pagamento = null,
    -- Slot liberado não herda a justificativa do paciente que saiu.
    cancelamento_motivo = null,
    cancelamento_em = null,
    cancelamento_por = null,
    reagendamento_motivo = null,
    reagendamento_em = null,
    reagendamento_por = null
  where id = _origem_id;

  update agendamentos set
    paciente_id = v_origem.paciente_id,
    paciente_nome = v_origem.paciente_nome,
    procedimento = v_novo_procedimento,
    status = 'agendado',
    observacoes = v_novas_obs,
    data_pagamento = v_origem.data_pagamento,
    reagendamento_motivo = nullif(btrim(coalesce(_motivo, '')), ''),
    reagendamento_em = case when nullif(btrim(coalesce(_motivo, '')), '') is null then null else now() end,
    reagendamento_por = case when nullif(btrim(coalesce(_motivo, '')), '') is null then null else auth.uid() end
  where id = _destino_id;

  update fin_lancamentos set
    agendamento_id = _destino_id,
    medico_id = v_destino.medico_id,
    paciente_id = v_origem.paciente_id
  where agendamento_id = _origem_id;

  return jsonb_build_object('origem_id', _origem_id, 'destino_id', _destino_id);
end;
$function$;


-- ----------------------------------------------------------------------------
-- agendamento_historico — devolve também as justificativas
-- ----------------------------------------------------------------------------
-- Só o bloco `marcacoes` muda: passa a carregar motivo, data e autor do
-- cancelamento e do reagendamento, com o nome já resolvido. O restante da
-- função é idêntico ao da migração anterior.
CREATE OR REPLACE FUNCTION public.agendamento_historico(_agendamento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_clinica   uuid;
  v_lanc      uuid[];
  v_lanc_txt  text[];
  v_atend_txt text[];
  v_ruido     text[] := ARRAY[
    'updated_at', 'edit_lock_at', 'edit_lock_by', 'edit_lock_by_nome',
    'fluxo_atualizado_em', 'token_publico', 'is_mock_data',
    'repasse_lock_id', 'repasse_lancamento_id', 'laudo_lancamento_id'
  ];
  v_contexto  text[] := ARRAY['paciente_nome', 'status', 'fluxo_etapa'];
  v_out       jsonb;
BEGIN
  SELECT a.clinica_id INTO v_clinica
    FROM public.agendamentos a
   WHERE a.id = _agendamento_id;

  IF v_clinica IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Agendamento não encontrado.');
  END IF;

  IF NOT public.is_member(auth.uid(), v_clinica) THEN
    RAISE EXCEPTION 'Acesso negado ao histórico deste agendamento.';
  END IF;

  SELECT coalesce(array_agg(fl.id), ARRAY[]::uuid[])
    INTO v_lanc
    FROM public.fin_lancamentos fl
   WHERE fl.agendamento_id = _agendamento_id;

  SELECT coalesce(array_agg(x::text), ARRAY[]::text[])
    INTO v_lanc_txt
    FROM unnest(v_lanc) AS x;

  SELECT coalesce(array_agg(fa.id::text), ARRAY[]::text[])
    INTO v_atend_txt
    FROM public.fin_atendimentos fa
   WHERE fa.agendamento_id = _agendamento_id;

  WITH aud AS (
    SELECT al.id,
           al.table_name,
           al.action,
           al.created_at,
           al.user_id,
           al.user_email,
           coalesce(al.dados_antes,  '{}'::jsonb) AS antes,
           coalesce(al.dados_depois, '{}'::jsonb) AS depois
      FROM public.audit_log al
     WHERE (al.table_name = 'agendamentos'     AND al.record_id = _agendamento_id::text)
        OR (al.table_name = 'fin_lancamentos'  AND al.record_id = ANY (v_lanc_txt))
        OR (al.table_name = 'fin_atendimentos' AND al.record_id = ANY (v_atend_txt))
     ORDER BY al.created_at DESC
     LIMIT 300
  ),
  aud_diff AS (
    SELECT a.id,
           a.table_name,
           a.action,
           a.created_at,
           a.user_id,
           a.user_email,
           d.chaves,
           a.antes,
           a.depois
      FROM aud a
      CROSS JOIN LATERAL (
        SELECT array_agg(k.key) AS chaves
          FROM jsonb_object_keys(a.antes || a.depois) AS k(key)
         WHERE (a.antes -> k.key) IS DISTINCT FROM (a.depois -> k.key)
           AND NOT (k.key = ANY (v_ruido))
      ) d
     WHERE a.action <> 'UPDATE' OR d.chaves IS NOT NULL
  ),
  auditoria AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'id',         x.id,
               'table_name', x.table_name,
               'action',     x.action,
               'created_at', x.created_at,
               'user_id',    x.user_id,
               'user_email', x.user_email,
               'autor',      public.fn_hist_quem(x.user_id, x.user_email, v_clinica),
               'dados_antes', (
                 SELECT coalesce(jsonb_object_agg(k, x.antes -> k), '{}'::jsonb)
                   FROM unnest(coalesce(x.chaves, ARRAY[]::text[]) || v_contexto) AS k
                  WHERE x.antes ? k OR x.depois ? k
               ),
               'dados_depois', (
                 SELECT coalesce(jsonb_object_agg(k, x.depois -> k), '{}'::jsonb)
                   FROM unnest(coalesce(x.chaves, ARRAY[]::text[]) || v_contexto) AS k
                  WHERE x.antes ? k OR x.depois ? k
               )
             )
             ORDER BY x.created_at DESC
           ) AS j
      FROM aud_diff x
  ),
  caixa AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'id',              cm.id,
               'tipo',            cm.tipo::text,
               'valor',           cm.valor,
               'forma_pagamento', cm.forma_pagamento,
               'descricao',       cm.descricao,
               'created_at',      cm.created_at,
               'autor',           public.fn_hist_quem(cm.user_id, NULL, v_clinica),
               'caixa_dono',      cs.user_nome,
               'caixa_status',    cs.status::text,
               'caixa_aberto_em', cs.aberto_em,
               'destino_nome',    cm.destino_nome
             )
             ORDER BY cm.created_at DESC
           ) AS j
      FROM public.caixa_movimentos cm
      LEFT JOIN public.caixa_sessoes cs ON cs.id = cm.sessao_id
     WHERE cm.lancamento_id = ANY (v_lanc)
  ),
  pagamentos AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'id',              fl.id,
               'valor',           fl.valor,
               'forma_pagamento', fl.forma_pagamento,
               'parcelas',        fl.parcelas,
               'bandeira_cartao', fl.bandeira_cartao,
               'composicao',      fl.composicao_pagamento,
               'status',          fl.status::text,
               'data',            fl.data,
               'created_at',      fl.created_at,
               'descricao',       fl.descricao,
               'autor',           public.fn_hist_quem(fl.criado_por, NULL, v_clinica),
               'repasse_pago',    fl.repasse_pago,
               'repasse_pago_em', fl.repasse_pago_em,
               'repasse_pago_at', fl.repasse_pago_at,
               'repasse_autor',   CASE WHEN fl.repasse_pago_por IS NULL THEN NULL
                                       ELSE public.fn_hist_quem(fl.repasse_pago_por, NULL, v_clinica) END
             )
             ORDER BY fl.created_at DESC
           ) AS j
      FROM public.fin_lancamentos fl
     WHERE fl.agendamento_id = _agendamento_id
  ),
  estornos AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'id',            es.id,
               'status',        es.status,
               'motivo',        es.motivo,
               'resposta',      es.resposta,
               'valor',         es.valor,
               'solicitado_em', es.solicitado_em,
               'solicitante',   public.fn_hist_quem(es.solicitado_por, NULL, v_clinica),
               'resolvido_em',  es.resolvido_em,
               'resolvedor',    CASE WHEN es.resolvido_por IS NULL THEN NULL
                                     ELSE public.fn_hist_quem(es.resolvido_por, NULL, v_clinica) END
             )
             ORDER BY es.solicitado_em DESC
           ) AS j
      FROM public.estorno_solicitacoes es
     WHERE es.agendamento_id = _agendamento_id
        OR es.lancamento_id = ANY (v_lanc)
  ),
  notas AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'id',         n.id,
               'texto',      n.texto,
               'created_at', n.created_at,
               'user_nome',  n.user_nome,
               'user_email', n.user_email
             )
             ORDER BY n.created_at DESC
           ) AS j
      FROM public.agendamento_historico_notas n
     WHERE n.agendamento_id = _agendamento_id
  ),
  marcacoes AS (
    SELECT jsonb_build_object(
             'sem_faturamento',        a.sem_faturamento,
             'sem_faturamento_em',     a.sem_faturamento_em,
             'sem_faturamento_motivo', a.sem_faturamento_motivo,
             'sem_faturamento_por',    a.sem_faturamento_por_nome,
             'sem_faturamento_autorizado_por', a.sem_faturamento_autorizado_por_nome,
             'cancelamento_motivo',    a.cancelamento_motivo,
             'cancelamento_em',        a.cancelamento_em,
             'cancelamento_por',       CASE WHEN a.cancelamento_por IS NULL THEN NULL
                                            ELSE public.fn_hist_quem(a.cancelamento_por, NULL, v_clinica) END,
             'reagendamento_motivo',   a.reagendamento_motivo,
             'reagendamento_em',       a.reagendamento_em,
             'reagendamento_por',      CASE WHEN a.reagendamento_por IS NULL THEN NULL
                                            ELSE public.fn_hist_quem(a.reagendamento_por, NULL, v_clinica) END,
             'executado_em',           a.executado_em,
             'executado_por',          CASE WHEN a.executado_por IS NULL THEN NULL
                                            ELSE public.fn_hist_quem(a.executado_por, NULL, v_clinica) END,
             'sinalizado_em',          a.sinalizado_em,
             'sinalizado_por',         a.sinalizado_por_nome,
             'convenio_autorizado',    a.convenio_autorizado,
             'convenio_autorizado_em', a.convenio_autorizado_em,
             'convenio_autorizado_por', CASE WHEN a.convenio_autorizado_por IS NULL THEN NULL
                                             ELSE public.fn_hist_quem(a.convenio_autorizado_por, NULL, v_clinica) END,
             'criado_por',             CASE WHEN a.criado_por IS NULL THEN NULL
                                            ELSE public.fn_hist_quem(a.criado_por, NULL, v_clinica) END,
             'origem_integracao',      a.origem_integracao
           ) AS j
      FROM public.agendamentos a
     WHERE a.id = _agendamento_id
  )
  SELECT jsonb_build_object(
           'ok',         true,
           'auditoria',  coalesce((SELECT j FROM auditoria),  '[]'::jsonb),
           'caixa',      coalesce((SELECT j FROM caixa),      '[]'::jsonb),
           'pagamentos', coalesce((SELECT j FROM pagamentos), '[]'::jsonb),
           'estornos',   coalesce((SELECT j FROM estornos),   '[]'::jsonb),
           'notas',      coalesce((SELECT j FROM notas),      '[]'::jsonb),
           'marcacoes',  coalesce((SELECT j FROM marcacoes),  '{}'::jsonb)
         )
    INTO v_out;

  RETURN v_out;
END;
$fn$;

REVOKE ALL ON FUNCTION public.agendamento_historico(uuid) FROM public;
REVOKE ALL ON FUNCTION public.agendamento_historico(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.agendamento_historico(uuid) TO authenticated;
