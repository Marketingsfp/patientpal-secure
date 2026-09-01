-- Destrava a quitação de saldo devedor.
--
-- O índice ux_fin_lancamentos_agendamento_receita permitia apenas UM
-- recebimento por atendimento, e por isso recusava o segundo lançamento que
-- toda quitação de saldo devedor exige (erro 23505 -> "Já existe um registro
-- com esses dados." na tela). A correção de 31/08 soltou só a trava do lado da
-- tela; esta migração solta a do banco.
--
-- No lugar entra uma trava de DUPLICATA EXATA: mesmo atendimento, mesmo valor,
-- mesma data — o clique duplo que o índice original existia para impedir.
-- Ver APLICAR-DESTRAVAR-SALDO-DEVEDOR-2026-09-01.sql na raiz do projeto.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Confere que não há duplicata exata antes de criar o índice novo.
--    Se houver, a transação para aqui e nada é alterado.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_conflitos int;
BEGIN
  SELECT count(*) INTO v_conflitos
  FROM (
    SELECT 1
    FROM public.fin_lancamentos
    WHERE agendamento_id IS NOT NULL
      AND tipo   = 'receita'::public.fin_tipo_lancamento
      AND status <> 'cancelado'::public.fin_status_lancamento
    GROUP BY agendamento_id, valor, data
    HAVING count(*) > 1
  ) d;

  IF v_conflitos > 0 THEN
    RAISE EXCEPTION
      'Existem % grupos de lançamentos duplicados exatos (mesmo atendimento, mesmo valor, mesma data). Resolva-os antes de aplicar esta migração.',
      v_conflitos;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Remove a trava cega de "um recebimento por atendimento".
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_fin_lancamentos_agendamento_receita;

-- ---------------------------------------------------------------------------
-- 3) Cria a trava de duplicata exata.
--    Mesmo atendimento + mesmo valor + mesma data = envio repetido.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_fin_lanc_receita_duplicata_exata
  ON public.fin_lancamentos (agendamento_id, valor, data)
  WHERE agendamento_id IS NOT NULL
    AND tipo   = 'receita'::public.fin_tipo_lancamento
    AND status <> 'cancelado'::public.fin_status_lancamento;

COMMENT ON INDEX public.ux_fin_lanc_receita_duplicata_exata IS
  'Impede o envio repetido do MESMO recebimento (mesmo atendimento, mesmo valor, mesma data). '
  'Substitui ux_fin_lancamentos_agendamento_receita, que permitia só um recebimento por '
  'atendimento e por isso barrava a quitação de saldo devedor e as parcelas recebidas em '
  'outras datas. O limite de quanto ainda pode ser recebido é a regra de negócio '
  'aceitaNovoRecebimento (soma recebida x agendamentos.valor_cobranca).';

-- ---------------------------------------------------------------------------
-- 4) Índice de apoio para a soma de recebimentos por atendimento, usada pela
--    tela de cobrança e pela lista "A Receber".
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_fin_lanc_receita_por_agendamento
  ON public.fin_lancamentos (agendamento_id)
  WHERE agendamento_id IS NOT NULL
    AND tipo   = 'receita'::public.fin_tipo_lancamento
    AND status <> 'cancelado'::public.fin_status_lancamento;

COMMIT;
