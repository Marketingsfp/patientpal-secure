-- Diagnóstico do card "O que dá para melhorar" (Financeiro → Projeção).
--
-- 1) fin_receita_resumo_dia: recebimentos confirmados por dia × médico ×
--    (Cartão Consulta ou particular). O médico vem do agendamento vinculado
--    e, sem ele, do próprio lançamento — em setembro/2026 só 114 de 3.530
--    recebimentos traziam `medico_id` gravado, mas 3.146 tinham agendamento.
--    Cartão = `convenio_modalidade = 'cartao_consulta'`, que é gravado quando
--    o contrato do Cartão vale, mesmo com o atendimento marcado "particular".
--
-- 2) fin_agenda_resumo_dia ganha a coluna `cancelados` (marcações com
--    paciente canceladas no dia). Mudar o formato do retorno exige recriar a
--    função; a lógica das colunas antigas é a mesma de 20260914180000.
--
-- Funções somente de leitura. Mesma trava de `fin_resumo_periodo`: só quem é
-- membro da clínica recebe linhas — é a mesma regra da leitura direta de
-- `fin_lancamentos` (policy fin_lanc_select), então não abre valor novo.

CREATE OR REPLACE FUNCTION public.fin_receita_resumo_dia(p_clinica uuid, p_ini date, p_fim date)
RETURNS TABLE(
  dia date,
  medico_id uuid,
  medico_nome text,
  especialidade text,
  cartao boolean,
  pagamentos bigint,
  receita numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $function$
BEGIN
  IF NOT public.is_member(auth.uid(), p_clinica) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT
      l.data,
      COALESCE(a.medico_id, l.medico_id),
      m.nome::text,
      e.nome::text,
      COALESCE(l.convenio_modalidade, '') = 'cartao_consulta',
      COUNT(*)::bigint,
      COALESCE(SUM(l.valor), 0)::numeric
    FROM public.fin_lancamentos l
    LEFT JOIN public.agendamentos a ON a.id = l.agendamento_id
    LEFT JOIN public.medicos m ON m.id = COALESCE(a.medico_id, l.medico_id)
    LEFT JOIN public.especialidades e ON e.id = m.especialidade_id
    WHERE l.clinica_id = p_clinica
      AND l.tipo = 'receita'
      AND l.status = 'confirmado'
      AND l.data >= p_ini AND l.data <= p_fim
    GROUP BY l.data, COALESCE(a.medico_id, l.medico_id), m.nome, e.nome,
      COALESCE(l.convenio_modalidade, '') = 'cartao_consulta'
    -- Ordem fixa: a tela lê o resultado em páginas de 1.000 linhas.
    ORDER BY 1, 2 NULLS FIRST, 5;
END;
$function$;

REVOKE ALL ON FUNCTION public.fin_receita_resumo_dia(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_receita_resumo_dia(uuid, date, date) TO authenticated;

DROP FUNCTION IF EXISTS public.fin_agenda_resumo_dia(uuid, date, date);

CREATE FUNCTION public.fin_agenda_resumo_dia(p_clinica uuid, p_ini date, p_fim date)
RETURNS TABLE(
  dia date,
  agenda_id uuid,
  agenda_nome text,
  ordem_chegada boolean,
  medico_id uuid,
  medico_nome text,
  especialidade text,
  vagas bigint,
  marcados bigint,
  compareceu bigint,
  cancelados bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $function$
BEGIN
  IF NOT public.is_member(auth.uid(), p_clinica) THEN
    RETURN;
  END IF;
  RETURN QUERY
    WITH base AS (
      SELECT
        (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
        a.agenda_id,
        a.medico_id,
        a.paciente_id IS NOT NULL AND a.status::text <> 'cancelado' AS marcado,
        a.status::text <> 'cancelado' AS vaga,
        a.paciente_id IS NOT NULL AND a.status::text = 'cancelado' AS cancelado,
        a.paciente_id IS NOT NULL AND a.status::text <> 'cancelado' AND (
          a.status::text IN ('realizado', 'confirmado')
          OR COALESCE(a.fluxo_etapa::text, 'aguardando_recepcao') <> 'aguardando_recepcao'
          OR EXISTS (
            SELECT 1 FROM public.fin_lancamentos l
            WHERE l.agendamento_id = a.id AND l.tipo = 'receita' AND l.status = 'confirmado'
          )
        ) AS veio
      FROM public.agendamentos a
      WHERE a.clinica_id = p_clinica
        AND a.inicio >= (p_ini::timestamp AT TIME ZONE 'America/Sao_Paulo')
        AND a.inicio < ((p_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
        AND COALESCE(a.is_mock_data, false) = false
    )
    SELECT
      b.dia,
      b.agenda_id,
      ag.nome::text,
      COALESCE(ag.ordem_chegada, false),
      b.medico_id,
      m.nome::text,
      e.nome::text,
      COUNT(*) FILTER (WHERE b.vaga)::bigint,
      COUNT(*) FILTER (WHERE b.marcado)::bigint,
      COUNT(*) FILTER (WHERE b.veio)::bigint,
      COUNT(*) FILTER (WHERE b.cancelado)::bigint
    FROM base b
    LEFT JOIN public.medico_agendas ag ON ag.id = b.agenda_id
    LEFT JOIN public.medicos m ON m.id = b.medico_id
    LEFT JOIN public.especialidades e ON e.id = m.especialidade_id
    GROUP BY b.dia, b.agenda_id, ag.nome, ag.ordem_chegada, b.medico_id, m.nome, e.nome
    -- Ordem fixa: a tela lê o resultado em páginas de 1.000 linhas.
    ORDER BY b.dia, b.agenda_id NULLS FIRST, b.medico_id NULLS FIRST;
END;
$function$;

REVOKE ALL ON FUNCTION public.fin_agenda_resumo_dia(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_agenda_resumo_dia(uuid, date, date) TO authenticated;
