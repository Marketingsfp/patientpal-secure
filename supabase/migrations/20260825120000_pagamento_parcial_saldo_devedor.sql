-- ---------------------------------------------------------------------------
-- Pagamento parcial / sinal com saldo devedor
--
-- Cenário (comum em Odontologia e tratamentos): o procedimento custa R$ 100,00,
-- o paciente paga R$ 50,00 de entrada hoje e os R$ 50,00 restantes na semana
-- seguinte.
--
-- O que já funcionava antes desta migração:
--   * o valor do recebimento sempre foi editável no diálogo de pagamento, então
--     dava para digitar R$ 50,00;
--   * cada lançamento gera UM movimento de caixa do seu próprio valor, na
--     sessão do dia em que foi registrado (fn_registrar_lancamento_e_caixa).
--     Ou seja, os R$ 50,00 de hoje já entravam sozinhos no caixa de hoje, e os
--     R$ 50,00 da semana que vem entrariam no caixa daquele dia. Nada disso
--     precisa mudar.
--
-- O que faltava: o sistema não guardava QUANTO era o total combinado. Como o
-- atendimento é considerado "pago" pela simples existência de um lançamento
-- confirmado, quem pagasse R$ 50,00 de R$ 100,00 ficava marcado como quitado e
-- os outros R$ 50,00 sumiam — não havia saldo devedor em lugar nenhum.
--
-- Correção: uma única coluna nova, `agendamentos.valor_cobranca`, com o total
-- combinado. Tudo o mais é DERIVADO na hora:
--
--     pago  = soma dos fin_lancamentos de receita confirmados do atendimento
--     saldo = valor_cobranca - pago
--
-- Derivar em vez de guardar um `valor_pago` denormalizado é proposital: quando
-- um pagamento é estornado, o lançamento deixa de ser 'confirmado' e o saldo
-- volta a aparecer sozinho, sem precisar de gatilho de sincronia que pudesse
-- ficar defasado.
--
-- Nada é retroativo: atendimentos antigos ficam com valor_cobranca NULL e
-- continuam se comportando exatamente como hoje (quem tem lançamento está
-- pago). O saldo devedor só existe para quem for cobrado parcialmente daqui
-- para frente.
-- ---------------------------------------------------------------------------

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS valor_cobranca numeric;

COMMENT ON COLUMN public.agendamentos.valor_cobranca IS
  'Valor total combinado da cobranca deste atendimento. Preenchido quando o '
  'paciente paga parcialmente (entrada/sinal). Saldo devedor = valor_cobranca '
  'menos a soma dos fin_lancamentos de receita confirmados do atendimento. '
  'NULL = atendimento sem cobranca parcial (comportamento antigo).';

-- Índice parcial: a tela "A Receber" varre só os atendimentos que têm total
-- combinado, que são poucos perto do volume da tabela.
CREATE INDEX IF NOT EXISTS idx_agendamentos_valor_cobranca
  ON public.agendamentos (clinica_id, inicio DESC)
  WHERE valor_cobranca IS NOT NULL;

-- ---------------------------------------------------------------------------
-- listar_saldos_em_aberto — alimenta a tela Financeiro > A Receber.
--
-- SECURITY INVOKER de propósito: a função roda com as permissões de quem
-- chamou, então as políticas de RLS de `agendamentos` e `fin_lancamentos`
-- (is_member) continuam valendo. Ninguém enxerga saldo de clínica que não é a
-- sua, e a função não abre nenhuma porta nova.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_saldos_em_aberto(
  _clinica_id uuid,
  _busca      text DEFAULT NULL,
  _limite     integer DEFAULT 300
)
RETURNS TABLE (
  agendamento_id   uuid,
  paciente_id      uuid,
  paciente_nome    text,
  procedimento     text,
  inicio           timestamptz,
  medico_nome      text,
  valor_cobranca   numeric,
  valor_pago       numeric,
  saldo            numeric,
  ultimo_pagamento date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH pagos AS (
    SELECT l.agendamento_id,
           SUM(l.valor)  AS pago,
           MAX(l.data)   AS ultima_data
      FROM public.fin_lancamentos l
     WHERE l.clinica_id = _clinica_id
       AND l.tipo       = 'receita'
       AND l.status     = 'confirmado'
       AND l.agendamento_id IS NOT NULL
     GROUP BY l.agendamento_id
  )
  SELECT a.id,
         a.paciente_id,
         a.paciente_nome,
         a.procedimento,
         a.inicio,
         m.nome,
         a.valor_cobranca,
         COALESCE(p.pago, 0),
         ROUND(a.valor_cobranca - COALESCE(p.pago, 0), 2),
         p.ultima_data
    FROM public.agendamentos a
    LEFT JOIN pagos          p ON p.agendamento_id = a.id
    LEFT JOIN public.medicos m ON m.id = a.medico_id
   WHERE a.clinica_id     = _clinica_id
     AND a.valor_cobranca IS NOT NULL
     AND a.status <> 'cancelado'
     -- Tolerância de meio centavo: evita que sobra de arredondamento vire
     -- "pendência" de R$ 0,00 na tela.
     AND a.valor_cobranca - COALESCE(p.pago, 0) > 0.004
     -- Precisa ter recebido ALGUMA coisa: "A Receber" é a lista de pagamentos
     -- parciais, não de atendimentos ainda não cobrados. Se a entrada for
     -- estornada depois, o atendimento sai daqui e volta a ser um atendimento
     -- comum a cobrar, em vermelho na agenda.
     AND COALESCE(p.pago, 0) > 0.004
     AND (
       _busca IS NULL
       OR btrim(_busca) = ''
       OR a.paciente_nome ILIKE '%' || btrim(_busca) || '%'
     )
   ORDER BY a.inicio DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limite, 300), 1000));
$$;

GRANT EXECUTE ON FUNCTION public.listar_saldos_em_aberto(uuid, text, integer) TO authenticated;
