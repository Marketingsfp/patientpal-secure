-- ---------------------------------------------------------------------------
-- REPASSE TRIPLO — terceiro (dono do equipamento) em VALOR FIXO
--
-- Até aqui a parte do terceiro só podia ser cadastrada em percentual do valor
-- total do atendimento. Passa a existir a opção "R$ Valor fixo": o terceiro
-- recebe exatamente o valor cadastrado por atendimento, o executante continua
-- pela regra dele e a clínica fica com o restante.
--
-- Exemplo: total R$ 100, executante 40% (R$ 40), terceiro R$ 25 fixo →
-- clínica fica com R$ 35.
--
-- Compatibilidade: as 50 linhas já cadastradas continuam em percentual
-- (DEFAULT 'percentual'); nada é recalculado e nenhum repasse já pago muda.
-- O livro-caixa `fin_repasse_terceiro` já guarda o `valor` pago e o
-- `percentual` nulo quando não se aplica — não precisa de coluna nova.
-- ---------------------------------------------------------------------------

ALTER TABLE public.medico_convenios
  ADD COLUMN IF NOT EXISTS tipo_repasse_terceiro text NOT NULL DEFAULT 'percentual',
  ADD COLUMN IF NOT EXISTS valor_terceiro numeric(12,2);

ALTER TABLE public.medico_convenios
  DROP CONSTRAINT IF EXISTS medico_convenios_tipo_repasse_terceiro_check;
ALTER TABLE public.medico_convenios
  ADD CONSTRAINT medico_convenios_tipo_repasse_terceiro_check
  CHECK (tipo_repasse_terceiro IN ('percentual', 'valor'));

ALTER TABLE public.medico_convenios
  DROP CONSTRAINT IF EXISTS medico_convenios_valor_terceiro_range;
ALTER TABLE public.medico_convenios
  ADD CONSTRAINT medico_convenios_valor_terceiro_range
  CHECK (valor_terceiro IS NULL OR valor_terceiro >= 0);

COMMENT ON COLUMN public.medico_convenios.tipo_repasse_terceiro IS
  'Repasse TRIPLO: como o terceiro recebe — ''percentual'' do valor total do atendimento ou ''valor'' fixo em reais por atendimento.';
COMMENT ON COLUMN public.medico_convenios.valor_terceiro IS
  'Repasse TRIPLO: valor fixo em reais pago ao terceiro por atendimento (só vale quando tipo_repasse_terceiro = ''valor'').';
COMMENT ON COLUMN public.medico_convenios.percentual_terceiro IS
  'Repasse TRIPLO: percentual do VALOR TOTAL do atendimento pago ao terceiro (só vale quando tipo_repasse_terceiro = ''percentual''). Nulo ou 0 = terceiro não recebe.';

COMMENT ON COLUMN public.fin_repasse_terceiro.percentual IS
  'Percentual aplicado quando a regra do terceiro era em percentual. Nulo quando o repasse foi em valor fixo.';
