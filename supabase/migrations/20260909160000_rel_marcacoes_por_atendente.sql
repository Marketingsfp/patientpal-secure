-- ============================================================================
-- RELATÓRIO DE MARCAÇÕES POR ATENDENTE (produtividade da recepção/telefonia)
-- Rodar no SQL editor do Lovable Cloud. Só cria índice e função — não altera
-- nenhum dado de paciente, agendamento ou caixa.
-- ============================================================================
--
-- POR QUE NÃO USAR `agendamentos.criado_por`
-- O pedido original supunha agrupar por essa coluna. Conferido na produção em
-- 09/09/2026: ela está VAZIA nos 94.069 agendamentos da base, sem exceção —
-- nunca foi preenchida pelo código. A tela "Agendamentos do Dia", que já lia
-- essa coluna, mostra a coluna de responsável em branco por esse motivo.
--
-- A fonte real de "quem marcou" é a auditoria (`audit_log`), que o gatilho
-- `trg_audit_agendamentos` alimenta desde 09/07/2026 com o usuário logado.
--
-- O QUE CONTA COMO UMA MARCAÇÃO
-- Neste sistema marcar um paciente quase nunca cria uma linha: a grade do dia
-- já nasce com as vagas, e a atendente PREENCHE uma vaga livre. Então uma
-- marcação é um destes dois eventos da auditoria:
--   • UPDATE em que o nome do paciente saiu de vazio/DISPONÍVEL/BLOQUEIO e
--     passou a ser um paciente de verdade — o caso normal do balcão;
--   • INSERT que já nasce com paciente — encaixe e atendimento externo.
--
-- Cada agendamento é creditado a UMA pessoa: a da marcação mais recente. É o
-- mesmo comportamento da coluna "USUÁRIO MARCAÇÃO" do sistema antigo (Clínica
-- Total) e faz o total do relatório bater exatamente com a quantidade de
-- agendamentos do período. Conferido: 01 a 09/09/2026 na Policlínica Menino
-- Jesus devolve 2.721 marcações, e a mesma janela tem 2.721 agendamentos com
-- paciente.
--
-- LIMITE DE HISTÓRICO
-- A auditoria começou em 09/07/2026. Agendamentos anteriores a essa data não
-- têm autor registrado e aparecem agrupados como "(marcado antes do registro)"
-- em vez de sumirem da conta. Cobertura conferida: julho 99,1%, agosto 100%,
-- setembro 100%.
--
-- QUEM PODE VER
-- Produtividade individual é ferramenta de supervisão, então a função exige a
-- marcação pessoal `pode_autorizar` (tela Equipe) somada a um perfil de
-- gestão. Só o perfil "admin" não serve de filtro: há 28 pessoas com esse
-- perfil na Menino Jesus, boa parte delas operadoras de balcão, e o relatório
-- lista o desempenho das colegas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Índice: o relatório busca o último evento de marcação de cada
--    agendamento. Sem ele o banco varre as 243 mil linhas de auditoria de
--    agendamentos a cada consulta.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_agend_record_data
  ON public.audit_log (record_id, created_at DESC)
  WHERE table_name = 'agendamentos';

-- ---------------------------------------------------------------------------
-- 2) Função do relatório
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rel_marcacoes_por_atendente(
  _clinica_id uuid,
  -- Período de ATENDIMENTO (dia em que o paciente é atendido).
  _atend_ini date DEFAULT NULL,
  _atend_fim date DEFAULT NULL,
  -- Período de MARCAÇÃO (dia em que a atendente lançou no sistema).
  _marc_ini date DEFAULT NULL,
  _marc_fim date DEFAULT NULL,
  -- Situação atual da ficha: agendado, confirmado, em_atendimento,
  -- realizado, cancelado, faltou. NULL = todas.
  _status text DEFAULT NULL,
  _medico_id uuid DEFAULT NULL,
  _especialidade_id uuid DEFAULT NULL
)
RETURNS TABLE (usuario_id uuid, usuario_nome text, qtd bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Alçada de supervisão: marcação individual + perfil de gestão.
  IF NOT EXISTS (
    SELECT 1
    FROM public.clinica_memberships cm
    WHERE cm.user_id = auth.uid()
      AND cm.clinica_id = _clinica_id
      AND cm.ativo
      AND cm.pode_autorizar
      AND cm.role IN ('admin', 'gestor')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para ver a produtividade da equipe.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.user_id,
    COALESCE(
      p.nome,
      m.user_email,
      CASE WHEN m.achou THEN '(não identificado)' ELSE '(marcado antes do registro)' END
    ) AS usuario_nome,
    count(*)::bigint AS qtd
  FROM public.agendamentos a
  -- LEFT JOIN de propósito: agendamento sem evento de marcação (anterior à
  -- auditoria) continua na conta, agrupado à parte. Se fosse INNER JOIN ele
  -- sumiria em silêncio e o total do relatório não bateria com a Agenda.
  LEFT JOIN LATERAL (
    SELECT al.user_id, al.user_email, al.created_at, true AS achou
    FROM public.audit_log al
    WHERE al.record_id = a.id::text
      AND al.table_name = 'agendamentos'
      AND al.action IN ('INSERT', 'UPDATE')
      AND lower(unaccent(COALESCE(al.dados_depois ->> 'paciente_nome', '')))
            NOT IN ('', 'disponivel', 'bloqueio')
      AND (
        al.action = 'INSERT'
        OR lower(unaccent(COALESCE(al.dados_antes ->> 'paciente_nome', '')))
             IN ('', 'disponivel', 'bloqueio')
      )
    ORDER BY al.created_at DESC
    LIMIT 1
  ) m ON true
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE a.clinica_id = _clinica_id
    -- Só fichas que hoje têm paciente: vaga livre não é marcação de ninguém.
    AND lower(unaccent(COALESCE(a.paciente_nome, ''))) NOT IN ('', 'disponivel', 'bloqueio')
    AND (_atend_ini IS NULL OR (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date >= _atend_ini)
    AND (_atend_fim IS NULL OR (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date <= _atend_fim)
    -- Filtrar por período de marcação exclui naturalmente quem não tem evento
    -- (comparação com NULL não é verdadeira), que é o comportamento certo:
    -- não dá para afirmar que foi marcado dentro da janela.
    AND (_marc_ini IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= _marc_ini)
    AND (_marc_fim IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= _marc_fim)
    AND (_status IS NULL OR a.status::text = _status)
    AND (_medico_id IS NULL OR a.medico_id = _medico_id)
    -- A especialidade vem do cadastro do MÉDICO: `agendamentos.especialidade_id`
    -- está vazia em 100% das fichas da produção (conferido em 09/09/2026).
    AND (
      _especialidade_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.medico_especialidades me
        WHERE me.medico_id = a.medico_id
          AND me.especialidade_id = _especialidade_id
      )
    )
  GROUP BY 1, 2
  ORDER BY 3 DESC, 2;
END;
$$;

COMMENT ON FUNCTION public.rel_marcacoes_por_atendente IS
  'Produtividade de marcações por atendente. Autor vem da auditoria (audit_log), não de agendamentos.criado_por, que nunca foi preenchida. Exige pode_autorizar + perfil de gestão.';

REVOKE ALL ON FUNCTION public.rel_marcacoes_por_atendente(
  uuid, date, date, date, date, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rel_marcacoes_por_atendente(
  uuid, date, date, date, date, text, uuid, uuid) TO authenticated;
