-- ============================================================================
-- RELATÓRIO "AGENDAMENTOS POR USUÁRIO" (produtividade da recepção)
-- Só cria uma função de leitura — não altera nenhum dado de paciente,
-- agendamento, caixa ou auditoria.
-- ============================================================================
--
-- O QUE MEDE
-- Quantas ações cada usuário fez na agenda dentro do período, pela DATA EM QUE
-- A AÇÃO FOI FEITA (não pela data do atendimento):
--   • Marcados    — paciente colocado numa vaga livre (DISPONÍVEL/BLOQUEIO/
--                   vazia) ou ficha nova que já nasce com paciente (encaixe).
--   • Remarcados  — paciente movido de um horário para outro. Não entra em
--                   "Marcados" nem em "Cancelados", embora o banco registre
--                   uma vaga liberada e outra preenchida.
--   • Cancelados  — paciente retirado da vaga (desmarcação), ficha com
--                   paciente excluída, ou situação passada para "cancelado".
--   • Confirmados — situação passada para "confirmado" (o azul da agenda).
--
-- DE ONDE VEM
-- Da auditoria (`audit_log`), alimentada pelo gatilho `trg_audit_agendamentos`
-- desde 09/07/2026 com o usuário logado. `agendamentos.criado_por` está vazia
-- em toda a base e não serve (ver 20260909160000_rel_marcacoes_por_atendente).
-- Não existe coluna de "quem confirmou": a confirmação só aparece aqui.
--
-- COMO A REMARCAÇÃO É RECONHECIDA
-- `reagendar_atendimento` libera a vaga de origem e preenche a de destino na
-- MESMA transação, então os dois eventos têm o mesmo `created_at` (now()) e o
-- mesmo nome de paciente. Isso vale para todo o histórico. Desde 04/09/2026 a
-- vaga de destino também grava `reagendamento_em`, usado como segundo sinal.
-- Conferido na produção (01 a 06/10/2026): os dois critérios dão o mesmo
-- número (463).
--
-- AÇÕES SEM USUÁRIO
-- Ações sem usuário logado (Nina, totem, integrações, rotinas do sistema)
-- aparecem numa linha própria, "Sistema", para o total bater.
--
-- QUEM PODE VER
-- Mesma alçada de `rel_marcacoes_por_atendente`: marcação individual
-- `pode_autorizar` (tela Equipe) somada a perfil admin/gestor.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rel_agendamentos_por_usuario(
  _clinica_id uuid,
  -- Período em que a AÇÃO foi feita (dia civil de São Paulo).
  _ini date,
  _fim date
)
RETURNS TABLE (
  usuario_id uuid,
  usuario_nome text,
  marcados bigint,
  confirmados bigint,
  cancelados bigint,
  remarcados bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
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

  IF _ini IS NULL OR _fim IS NULL OR _fim < _ini THEN
    RAISE EXCEPTION 'Informe um período válido.';
  END IF;

  RETURN QUERY
  WITH ev AS (
    SELECT
      al.user_id,
      al.user_email,
      al.action,
      al.created_at,
      lower(unaccent(COALESCE(al.dados_antes ->> 'paciente_nome', '')))
        NOT IN ('', 'disponivel', 'bloqueio') AS tinha_pac,
      lower(unaccent(COALESCE(al.dados_depois ->> 'paciente_nome', '')))
        NOT IN ('', 'disponivel', 'bloqueio') AS tem_pac,
      al.dados_antes ->> 'paciente_nome' AS pac_antes,
      al.dados_depois ->> 'paciente_nome' AS pac_depois,
      al.dados_antes ->> 'status' AS st_antes,
      al.dados_depois ->> 'status' AS st_depois,
      al.dados_antes ->> 'reagendamento_em' AS rg_antes,
      al.dados_depois ->> 'reagendamento_em' AS rg_depois
    FROM public.audit_log al
    WHERE al.clinica_id = _clinica_id
      AND al.table_name = 'agendamentos'
      AND al.created_at >= (_ini::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND al.created_at < ((_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
  ),
  -- Paciente entrou numa vaga.
  marc AS (
    SELECT * FROM ev
    WHERE ev.tem_pac
      AND (ev.action = 'INSERT' OR (ev.action = 'UPDATE' AND NOT ev.tinha_pac))
  ),
  -- Paciente saiu da vaga, que voltou a ficar livre.
  lib AS (
    SELECT * FROM ev
    WHERE ev.action = 'UPDATE' AND ev.tinha_pac AND NOT ev.tem_pac
  ),
  classif AS (
    SELECT
      m.user_id,
      m.user_email,
      CASE
        WHEN (m.rg_depois IS NOT NULL AND m.rg_depois IS DISTINCT FROM m.rg_antes)
          OR EXISTS (
            SELECT 1 FROM lib l
            WHERE l.created_at = m.created_at AND l.pac_antes = m.pac_depois
          )
        THEN 'remarcado'
        ELSE 'marcado'
      END AS tipo
    FROM marc m
    UNION ALL
    -- Desmarcação: vaga liberada que não é a origem de uma remarcação. Ficha já
    -- cancelada não conta de novo ao ser liberada.
    SELECT l.user_id, l.user_email, 'cancelado'
    FROM lib l
    WHERE COALESCE(l.st_antes, '') <> 'cancelado'
      AND NOT EXISTS (
        SELECT 1 FROM marc m
        WHERE m.created_at = l.created_at AND m.pac_depois = l.pac_antes
      )
    UNION ALL
    SELECT e.user_id, e.user_email, 'cancelado'
    FROM ev e
    WHERE e.action = 'DELETE' AND e.tinha_pac AND COALESCE(e.st_antes, '') <> 'cancelado'
    UNION ALL
    SELECT e.user_id, e.user_email, 'cancelado'
    FROM ev e
    WHERE e.action = 'UPDATE' AND e.st_depois = 'cancelado'
      AND e.st_antes IS DISTINCT FROM 'cancelado'
    UNION ALL
    SELECT e.user_id, e.user_email, 'confirmado'
    FROM ev e
    WHERE e.action = 'UPDATE' AND e.st_depois = 'confirmado'
      AND e.st_antes IS DISTINCT FROM 'confirmado'
  )
  SELECT
    c.user_id,
    COALESCE(p.nome, max(c.user_email), 'Sistema') AS usuario_nome,
    count(*) FILTER (WHERE c.tipo = 'marcado')::bigint,
    count(*) FILTER (WHERE c.tipo = 'confirmado')::bigint,
    count(*) FILTER (WHERE c.tipo = 'cancelado')::bigint,
    count(*) FILTER (WHERE c.tipo = 'remarcado')::bigint
  FROM classif c
  LEFT JOIN public.profiles p ON p.id = c.user_id
  GROUP BY c.user_id, p.nome
  ORDER BY count(*) DESC, 2;
END;
$$;

COMMENT ON FUNCTION public.rel_agendamentos_por_usuario IS
  'Produtividade da recepção: marcados, confirmados, cancelados e remarcados por usuário, pela data da ação, lidos da auditoria. Exige pode_autorizar + perfil de gestão.';

REVOKE ALL ON FUNCTION public.rel_agendamentos_por_usuario(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rel_agendamentos_por_usuario(uuid, date, date) TO authenticated;
