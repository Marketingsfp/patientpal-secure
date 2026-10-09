-- ============================================================================
-- RELATÓRIOS → "AGENDAMENTOS DO DIA": lista de pacientes marcados no período,
-- com quem marcou. Só cria uma função de leitura — não altera nenhum dado.
-- ============================================================================
--
-- POR QUE A TELA MUDA DE FONTE
-- A aba lia `agendamentos.created_at` e `agendamentos.criado_por`. Nenhuma das
-- duas diz quem marcou nem quando:
--   • `criado_por` está vazia em 100% das fichas (conferido em 06/10/2026:
--     nenhum agendamento de nenhum mês) — a aba agrupava tudo em
--     "Sem usuário / Sistema";
--   • a grade do dia já nasce com as vagas, e marcar é PREENCHER uma vaga.
--     `created_at` é o dia em que a vaga foi gerada: de 06/09 a 06/10/2026 a
--     aba listava 5.431 "criados", mas 9.338 pacientes foram marcados.
--
-- A regra de "o que é uma marcação" e de "a quem ela é creditada" é a mesma de
-- `rel_marcacoes_por_atendente` (APLICAR-RELATORIO-MARCACOES-POR-ATENDENTE-
-- 2026-09-09.sql): evento da auditoria em que o nome do paciente saiu de
-- vazio/DISPONÍVEL/BLOQUEIO para um paciente de verdade (ou INSERT já com
-- paciente), e cada ficha conta uma vez, na marcação mais recente. Assim o
-- total desta aba bate com "Marcações por atendente" filtrada pelo mesmo
-- período de marcação.
--
-- QUEM VÊ O QUÊ
-- Qualquer membro ativo da clínica vê a lista (como antes, pela Agenda já
-- veria as mesmas fichas). O NOME de quem marcou é produtividade individual:
-- só volta para quem tem a alçada de supervisão — marcação pessoal
-- `pode_autorizar` (tela Equipe) + perfil admin/gestor —, a mesma regra de
-- "Marcações por atendente" (decidido pelo dono em 06/10/2026). Para os
-- demais, `usuario_id` e `usuario_nome` voltam nulos.
--
-- A função é SECURITY DEFINER porque a auditoria só é legível por gestores;
-- por isso ela mesma confere a clínica e a alçada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rel_agendamentos_marcados(
  _clinica_id uuid,
  -- Período de MARCAÇÃO (dia em que a atendente lançou o paciente).
  _marc_ini date,
  _marc_fim date
)
RETURNS TABLE (
  agendamento_id uuid,
  marcado_em timestamptz,
  usuario_id uuid,
  usuario_nome text,
  paciente_nome text,
  inicio timestamptz,
  procedimento text,
  medico_id uuid,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _supervisor boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.clinica_memberships cm
    WHERE cm.user_id = auth.uid()
      AND cm.clinica_id = _clinica_id
      AND cm.ativo
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta clínica.' USING ERRCODE = '42501';
  END IF;

  IF _marc_ini IS NULL OR _marc_fim IS NULL OR _marc_fim < _marc_ini THEN
    RAISE EXCEPTION 'Informe o período de marcação.' USING ERRCODE = '22023';
  END IF;

  _supervisor := EXISTS (
    SELECT 1
    FROM public.clinica_memberships cm
    WHERE cm.user_id = auth.uid()
      AND cm.clinica_id = _clinica_id
      AND cm.ativo
      AND cm.pode_autorizar
      AND cm.role IN ('admin', 'gestor')
  );

  RETURN QUERY
  WITH ev AS (
    -- Última marcação de cada ficha DENTRO da janela (índice clinica+data).
    SELECT DISTINCT ON (al.record_id)
      al.record_id, al.user_id, al.user_email, al.created_at
    FROM public.audit_log al
    WHERE al.clinica_id = _clinica_id
      AND al.table_name = 'agendamentos'
      AND al.action IN ('INSERT', 'UPDATE')
      AND al.created_at >= (_marc_ini::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND al.created_at < ((_marc_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND lower(unaccent(COALESCE(al.dados_depois ->> 'paciente_nome', '')))
            NOT IN ('', 'disponivel', 'bloqueio')
      AND (
        al.action = 'INSERT'
        OR lower(unaccent(COALESCE(al.dados_antes ->> 'paciente_nome', '')))
             IN ('', 'disponivel', 'bloqueio')
      )
    ORDER BY al.record_id, al.created_at DESC
  )
  SELECT
    a.id,
    ev.created_at,
    CASE WHEN _supervisor THEN ev.user_id END,
    CASE WHEN _supervisor THEN COALESCE(p.nome, ev.user_email, '(não identificado)') END,
    a.paciente_nome,
    a.inicio,
    a.procedimento,
    a.medico_id,
    a.status::text
  FROM ev
  JOIN public.agendamentos a
    ON a.id::text = ev.record_id
   AND a.clinica_id = _clinica_id
  LEFT JOIN public.profiles p ON p.id = ev.user_id
  -- Só fichas que hoje têm paciente: vaga devolvida não é marcação de ninguém.
  WHERE lower(unaccent(COALESCE(a.paciente_nome, ''))) NOT IN ('', 'disponivel', 'bloqueio')
    -- Remarcada depois da janela: o crédito é da marcação mais recente, que
    -- cai em outro período (mesma regra de rel_marcacoes_por_atendente).
    AND NOT EXISTS (
      SELECT 1
      FROM public.audit_log l2
      WHERE l2.record_id = ev.record_id
        AND l2.table_name = 'agendamentos'
        AND l2.created_at > ev.created_at
        AND l2.action IN ('INSERT', 'UPDATE')
        AND lower(unaccent(COALESCE(l2.dados_depois ->> 'paciente_nome', '')))
              NOT IN ('', 'disponivel', 'bloqueio')
        AND (
          l2.action = 'INSERT'
          OR lower(unaccent(COALESCE(l2.dados_antes ->> 'paciente_nome', '')))
               IN ('', 'disponivel', 'bloqueio')
        )
    )
  ORDER BY ev.created_at, a.id;
END;
$$;

COMMENT ON FUNCTION public.rel_agendamentos_marcados IS
  'Relatórios → Agendamentos do Dia: fichas marcadas no período (auditoria, não created_at/criado_por). Nome de quem marcou só para supervisão (pode_autorizar + admin/gestor).';

REVOKE ALL ON FUNCTION public.rel_agendamentos_marcados(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rel_agendamentos_marcados(uuid, date, date) TO authenticated;
