-- ============================================================================
-- HISTÓRICO COMPLETO DO AGENDAMENTO (auditoria em uma única janela)
-- ============================================================================
--
-- PROBLEMA 1 — coluna "Usuário" mostrando "sistema".
--
-- A tela lia `audit_log` direto do navegador e imprimia o `user_email` cru.
-- Conferindo a produção, o texto "sistema" tem TRÊS origens diferentes, e
-- nenhuma delas é falha de captura do usuário logado:
--
--   * "sistema (manutenção)" — gravação feita por SQL rodado à mão no editor
--     (sem cabeçalho HTTP). São as correções em massa: 36.005 linhas em
--     11/08, 31.652 em 05/08 e 2.118 em 01/09, quase todas trocando
--     `procedimento`. Cada uma dessas aparecia dentro do histórico de todo
--     agendamento tocado pelo script.
--   * "sistema" — gravação vinda do servidor sem token de usuário: assistente
--     Nina (WhatsApp), totem e API de integração externa.
--   * "sistema (service_role)" — rotina automática.
--
-- Além disso a tela resolvia o nome do autor com a lista da equipe, que só
-- carrega para admin/gestor (`listarEquipe` exige `can_manage_clinica`). Para
-- a recepção a lista vinha vazia e TODO nome caía no e-mail cru.
--
-- E havia uma barreira maior: a RLS de `audit_log` só libera leitura para
-- quem administra a clínica. Recepção e supervisão sem esse papel abriam a
-- janela e não viam absolutamente nenhum evento de auditoria.
--
-- PROBLEMA 2 — faltavam caixa e presença.
--
-- O check-in até era deduzido de `fluxo_etapa`, mas só era visível para quem
-- passava na RLS acima. O recebimento no caixa nunca era consultado: a tela
-- lia apenas `audit_log` de `agendamentos` e de `fin_lancamentos`, e do
-- pagamento mostrava só "Pagamento registrado", sem valor, sem forma e sem
-- dizer em qual caixa e com qual operador o dinheiro entrou.
--
-- SOLUÇÃO
--
-- Uma função SECURITY DEFINER que monta o material do histórico no banco e
-- devolve tudo pronto numa chamada só:
--
--   1. libera a leitura para qualquer membro da clínica (`is_member`), sem
--      abrir a tabela `audit_log` inteira para quem não administra;
--   2. resolve o nome e o papel do autor no próprio banco (médicos,
--      profiles, memberships, auth.users), de modo que a tela não dependa
--      mais da lista de equipe;
--   3. traduz os "sistema (...)" para um rótulo que a supervisão entenda;
--   4. junta caixa (`caixa_movimentos` + `caixa_sessoes`), pagamento
--      (`fin_lancamentos`), estornos, notas manuais e as marcações que o
--      próprio agendamento guarda (sem faturamento, realizado por, etc.);
--   5. corta o ruído de auditoria (trava de edição, `updated_at`), que hoje
--      enchia a lista de linhas "Alterou" sem significado.
--
-- Nada é gravado. As duas funções são STABLE e só leem.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Quem é o autor de uma linha do histórico
-- ----------------------------------------------------------------------------
-- Recebe o par (user_id, user_email) que a auditoria gravou e devolve
-- { nome, papel, origem }. `origem` separa pessoa de automação, para a tela
-- poder marcar visualmente as linhas que não têm um responsável humano.
CREATE OR REPLACE FUNCTION public.fn_hist_quem(
  _user_id uuid,
  _email text,
  _clinica uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_nome   text;
  v_papel  text;
  v_mail   text;
  v_dentro text;
BEGIN
  -- Caminho normal: a auditoria gravou o usuário autenticado.
  IF _user_id IS NOT NULL THEN
    SELECT m.nome INTO v_nome
      FROM public.medicos m
     WHERE m.user_id = _user_id
       AND m.clinica_id = _clinica
     LIMIT 1;
    IF v_nome IS NOT NULL AND btrim(v_nome) <> '' THEN
      RETURN jsonb_build_object('nome', v_nome, 'papel', 'medico', 'origem', 'pessoa');
    END IF;

    SELECT p.nome INTO v_nome FROM public.profiles p WHERE p.id = _user_id;

    SELECT cm.role::text INTO v_papel
      FROM public.clinica_memberships cm
     WHERE cm.user_id = _user_id
       AND cm.clinica_id = _clinica
     LIMIT 1;

    IF v_nome IS NULL OR btrim(v_nome) = '' THEN
      SELECT u.email INTO v_nome FROM auth.users u WHERE u.id = _user_id;
    END IF;

    RETURN jsonb_build_object(
      'nome',   coalesce(nullif(btrim(v_nome), ''), nullif(btrim(coalesce(_email, '')), ''), 'Usuário'),
      'papel',  coalesce(v_papel, 'funcionario'),
      'origem', 'pessoa'
    );
  END IF;

  v_mail := lower(btrim(coalesce(_email, '')));

  IF v_mail = '' THEN
    RETURN jsonb_build_object('nome', 'Sistema', 'papel', 'sistema', 'origem', 'sistema');
  END IF;

  -- Linhas gravadas sem usuário autenticado. Em vez de repetir o texto cru
  -- "sistema (manutenção)" — que não diz nada para quem audita — explicamos
  -- de onde a gravação veio.
  IF v_mail LIKE 'sistema%' THEN
    v_dentro := nullif(btrim(substring(v_mail from '^sistema[[:space:]]*[(](.*)[)]$')), '');
    RETURN jsonb_build_object(
      'nome',
      CASE
        WHEN v_dentro IS NULL THEN 'Automático (assistente, totem ou integração)'
        WHEN v_dentro IN ('manutencao', 'manutenção')
                              THEN 'Manutenção do sistema (correção em massa pelo administrador)'
        WHEN v_dentro = 'service_role' THEN 'Rotina automática do sistema'
        ELSE 'Sistema — ' || v_dentro
      END,
      'papel',  'sistema',
      'origem', 'sistema'
    );
  END IF;

  -- Sobrou um e-mail: pessoa que saiu da equipe ou que perdeu o vínculo.
  SELECT coalesce(nullif(btrim(p.nome), ''), u.email) INTO v_nome
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
   WHERE lower(u.email) = v_mail
   LIMIT 1;

  SELECT cm.role::text INTO v_papel
    FROM public.clinica_memberships cm
    JOIN auth.users u ON u.id = cm.user_id
   WHERE lower(u.email) = v_mail
     AND cm.clinica_id = _clinica
   LIMIT 1;

  RETURN jsonb_build_object(
    'nome',   coalesce(nullif(btrim(v_nome), ''), _email),
    'papel',  coalesce(v_papel, 'funcionario'),
    'origem', 'pessoa'
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_hist_quem(uuid, text, uuid) FROM public;
REVOKE ALL ON FUNCTION public.fn_hist_quem(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hist_quem(uuid, text, uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 2) Histórico do agendamento
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.agendamento_historico(uuid);

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
  -- Colunas que mudam sozinhas e não dizem nada a quem audita. A trava de
  -- edição (`edit_lock_*`) era a pior: cada vez que alguém abria a ficha
  -- entravam duas linhas "Alterou" no histórico.
  v_ruido     text[] := ARRAY[
    'updated_at', 'edit_lock_at', 'edit_lock_by', 'edit_lock_by_nome',
    'fluxo_atualizado_em', 'token_publico', 'is_mock_data',
    'repasse_lock_id', 'repasse_lancamento_id', 'laudo_lancamento_id'
  ];
  -- Colunas sempre devolvidas mesmo quando não mudaram: a tela precisa delas
  -- para saber se a linha era um slot livre ou um paciente de verdade.
  v_contexto  text[] := ARRAY['paciente_nome', 'status', 'fluxo_etapa'];
  v_out       jsonb;
BEGIN
  SELECT a.clinica_id INTO v_clinica
    FROM public.agendamentos a
   WHERE a.id = _agendamento_id;

  IF v_clinica IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Agendamento não encontrado.');
  END IF;

  -- Qualquer membro da clínica pode auditar o agendamento. A RLS de
  -- `audit_log` continua fechada para quem não administra; o acesso aqui é
  -- estreito de propósito — um agendamento por vez, nunca a tabela toda.
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
     -- Um UPDATE que só mexeu em ruído não vira linha de histórico.
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
    -- Presença do dinheiro: quem recebeu, quanto, em que forma, em qual
    -- gaveta. `caixa_sessoes.user_nome` é o dono do caixa em que a entrada
    -- caiu; `cm.user_id` é quem digitou o recebimento.
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
    -- Estado atual do lançamento. Completa a linha de pagamento com valor e
    -- forma mesmo quando a auditoria do INSERT já foi podada pela limpeza de
    -- 180 dias do audit_log.
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
    -- Carimbos que o próprio agendamento guarda. Valem mais que a auditoria
    -- porque sobrevivem à limpeza de 180 dias e já trazem o nome gravado.
    SELECT jsonb_build_object(
             'sem_faturamento',        a.sem_faturamento,
             'sem_faturamento_em',     a.sem_faturamento_em,
             'sem_faturamento_motivo', a.sem_faturamento_motivo,
             'sem_faturamento_por',    a.sem_faturamento_por_nome,
             'sem_faturamento_autorizado_por', a.sem_faturamento_autorizado_por_nome,
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

COMMENT ON FUNCTION public.agendamento_historico(uuid) IS
  'Histórico de auditoria de um agendamento em uma única janela: criação, agendamento, check-in, recebimento no caixa (valor, forma, operador), estornos, sem faturamento, cancelamento e reagendamento — com nome e papel do responsável já resolvidos. Liberada para qualquer membro da clínica; audit_log continua fechada pela RLS.';
