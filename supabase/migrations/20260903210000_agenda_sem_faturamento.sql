-- ============================================================================
-- AGENDA SEM FATURAMENTO (Toxicológico e afins)
-- ============================================================================
-- Recurso que existia no sistema antigo e faltava no novo: marcar um
-- agendamento como "sem faturamento" / valor 0,00.
--
-- Para que serve: exames como o TOXICOLÓGICO não são cobrados pelo caixa da
-- clínica — o paciente paga direto ao laboratório/parceiro. A clínica só faz o
-- procedimento (a coleta) e entrega a guia. Sem uma marcação própria, esses
-- atendimentos ficavam eternamente "não pagos" na agenda, travavam a impressão
-- da GR e apareciam como cobrança em aberto para o financeiro.
--
-- O que esta migração cria:
--   1. As colunas da marcação em `agendamentos` (quem marcou e quando ficam
--      gravados na própria linha, para o selo da agenda não precisar consultar
--      `profiles` a cada atendimento listado).
--   2. Uma trava no banco que recusa lançar RECEITA com valor em um
--      atendimento marcado. É a rede de segurança do "não inflar contas a
--      receber": mesmo que uma tela antiga, um script ou uma importação tentem
--      cobrar, o banco recusa.
--
-- Não mexe em nenhum dado existente: a coluna nasce `false` para todos os
-- agendamentos já gravados, então nada muda no comportamento atual até que
-- alguém marque um atendimento na tela.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Colunas da marcação
-- ---------------------------------------------------------------------------
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS sem_faturamento boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sem_faturamento_em timestamptz,
  ADD COLUMN IF NOT EXISTS sem_faturamento_por uuid,
  ADD COLUMN IF NOT EXISTS sem_faturamento_por_nome text;

COMMENT ON COLUMN public.agendamentos.sem_faturamento IS
  'true = atendimento realizado sem cobrança da clínica (ex.: Toxicológico, pago direto ao parceiro). Não gera lançamento financeiro, não entra no caixa e a GR sai com valor, clínica e prestador zerados.';
COMMENT ON COLUMN public.agendamentos.sem_faturamento_em IS
  'Quando a marcação "sem faturamento" foi feita. NULL quando não está marcado.';
COMMENT ON COLUMN public.agendamentos.sem_faturamento_por IS
  'Usuário que marcou o atendimento como sem faturamento.';
COMMENT ON COLUMN public.agendamentos.sem_faturamento_por_nome IS
  'Nome de quem marcou, gravado na linha para o selo da agenda não precisar consultar profiles em cada atendimento listado.';

-- Índice PARCIAL: só indexa as linhas marcadas, que são poucas. Um índice
-- comum sobre um boolean quase sempre `false` ocuparia espaço sem ajudar
-- nenhuma consulta.
CREATE INDEX IF NOT EXISTS idx_agendamentos_sem_faturamento
  ON public.agendamentos (clinica_id, inicio)
  WHERE sem_faturamento;

-- ---------------------------------------------------------------------------
-- 2. Trava de caixa: atendimento marcado não aceita receita
-- ---------------------------------------------------------------------------
-- Recusa apenas RECEITA COM VALOR. O que continua permitido, de propósito:
--   - despesa vinculada ao atendimento (material usado na coleta, por
--     exemplo), que é dinheiro SAINDO e não infla nada a receber;
--   - lançamento de valor 0,00, usado pelo sistema como linha de registro em
--     vários fluxos (retroativo, estorno) e que não move a gaveta;
--   - lançamento já cancelado.
--
-- Se a recepção marcou por engano e o paciente precisa mesmo pagar, o caminho
-- é remover a marcação na agenda e cobrar normalmente — a mensagem de erro diz
-- exatamente isso, para a funcionária não ficar travada sem saber o que fazer.
CREATE OR REPLACE FUNCTION public.fn_bloquear_receita_sem_faturamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marcado boolean;
BEGIN
  IF NEW.agendamento_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- `tipo` e `status` são ENUMs. Um COALESCE(NEW.tipo, '') faz o Postgres
  -- converter a string vazia para o enum ANTES de olhar o valor da linha, e
  -- isso derruba TODA cobrança com a mensagem
  -- 'invalid input value for enum fin_tipo_lancamento: ""'. Por isso a
  -- comparação é direta, sem string vazia no meio.
  IF NEW.tipo IS DISTINCT FROM 'receita'::public.fin_tipo_lancamento THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.valor, 0) <= 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS NOT DISTINCT FROM 'cancelado'::public.fin_status_lancamento THEN
    RETURN NEW;
  END IF;

  SELECT a.sem_faturamento INTO v_marcado
  FROM public.agendamentos a
  WHERE a.id = NEW.agendamento_id;

  IF COALESCE(v_marcado, false) THEN
    RAISE EXCEPTION
      'Este atendimento está marcado como SEM FATURAMENTO (o paciente paga direto ao parceiro) e não aceita cobrança. Se ele precisa mesmo pagar na clínica, remova a marcação na Agenda antes de lançar.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_receita_sem_faturamento ON public.fin_lancamentos;
CREATE TRIGGER trg_bloquear_receita_sem_faturamento
  BEFORE INSERT OR UPDATE OF agendamento_id, valor, tipo, status
  ON public.fin_lancamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_bloquear_receita_sem_faturamento();

-- ---------------------------------------------------------------------------
-- 3. Trava do outro lado: não marcar um atendimento que JÁ foi cobrado
-- ---------------------------------------------------------------------------
-- Sem isto, marcar depois da cobrança criaria um atendimento contraditório: a
-- GR sairia zerada enquanto o dinheiro do paciente continuaria na gaveta do
-- caixa daquele dia, e a conferência do cupom não fecharia. O caminho certo
-- nesse caso é estornar o pagamento no Financeiro e só então marcar.
CREATE OR REPLACE FUNCTION public.fn_bloquear_marcar_sem_faturamento_pago()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sem_faturamento AND NOT COALESCE(OLD.sem_faturamento, false) THEN
    IF EXISTS (
      SELECT 1
      FROM public.fin_lancamentos l
      WHERE l.agendamento_id = NEW.id
        AND l.tipo = 'receita'
        AND l.status = 'confirmado'
        AND COALESCE(l.valor, 0) > 0
    ) THEN
      RAISE EXCEPTION
        'Este atendimento já foi cobrado no caixa e não pode ser marcado como SEM FATURAMENTO. Estorne o pagamento no Financeiro antes de marcar.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_marcar_sem_faturamento_pago ON public.agendamentos;
CREATE TRIGGER trg_bloquear_marcar_sem_faturamento_pago
  BEFORE UPDATE OF sem_faturamento
  ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_bloquear_marcar_sem_faturamento_pago();

COMMIT;
