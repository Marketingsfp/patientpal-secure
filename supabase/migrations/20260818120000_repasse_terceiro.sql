-- ---------------------------------------------------------------------------
-- REPASSE TRIPLO (comissão de terceiros)
--
-- Cenário comum na oftalmologia: o exame é feito com equipamento de outro
-- médico. A clínica retém a parte dela e o repasse é dividido em dois:
-- o MÉDICO EXECUTANTE (quem atendeu) e o TERCEIRO (dono do equipamento).
--
-- Exemplo: total R$ 100 → clínica 30% (R$ 30), executante 40% (R$ 40),
-- terceiro 30% (R$ 30). Os dois percentuais são sempre sobre o VALOR TOTAL
-- do atendimento, não sobre o que sobra depois da clínica.
-- ---------------------------------------------------------------------------

-- 1) Regra cadastrada por serviço ------------------------------------------
ALTER TABLE public.medico_convenios
  ADD COLUMN IF NOT EXISTS terceiro_id uuid REFERENCES public.medicos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS percentual_terceiro numeric(5,2);

ALTER TABLE public.medico_convenios
  DROP CONSTRAINT IF EXISTS medico_convenios_percentual_terceiro_range;
ALTER TABLE public.medico_convenios
  ADD CONSTRAINT medico_convenios_percentual_terceiro_range
  CHECK (percentual_terceiro IS NULL OR (percentual_terceiro >= 0 AND percentual_terceiro <= 100));

-- Um médico não pode ser terceiro de si mesmo (viraria repasse duplicado).
ALTER TABLE public.medico_convenios
  DROP CONSTRAINT IF EXISTS medico_convenios_terceiro_diferente;
ALTER TABLE public.medico_convenios
  ADD CONSTRAINT medico_convenios_terceiro_diferente
  CHECK (terceiro_id IS NULL OR terceiro_id <> medico_id);

CREATE INDEX IF NOT EXISTS idx_medico_convenios_terceiro
  ON public.medico_convenios(terceiro_id) WHERE terceiro_id IS NOT NULL;

COMMENT ON COLUMN public.medico_convenios.terceiro_id IS
  'Repasse TRIPLO: médico terceiro (ex.: dono do equipamento) que também recebe por este serviço. Nulo = sem terceiro.';
COMMENT ON COLUMN public.medico_convenios.percentual_terceiro IS
  'Repasse TRIPLO: percentual do VALOR TOTAL do atendimento pago ao terceiro. Nulo ou 0 = terceiro não recebe.';

-- 2) Livro-caixa dos repasses de terceiro já pagos --------------------------
-- Só recebe linha quando o repasse do terceiro é efetivamente pago. Assim o
-- histórico anterior continua íntegro (nada de backfill) e o "já paguei este
-- terceiro por este atendimento?" fica sendo uma pergunta com resposta única.
CREATE TABLE IF NOT EXISTS public.fin_repasse_terceiro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  origem text NOT NULL CHECK (origem IN ('agenda','manual')),
  lancamento_id uuid REFERENCES public.fin_lancamentos(id) ON DELETE CASCADE,
  atendimento_id uuid REFERENCES public.fin_atendimentos(id) ON DELETE CASCADE,
  executante_medico_id uuid REFERENCES public.medicos(id) ON DELETE SET NULL,
  terceiro_medico_id uuid NOT NULL REFERENCES public.medicos(id) ON DELETE RESTRICT,
  percentual numeric(5,2),
  valor numeric(12,2) NOT NULL CHECK (valor >= 0),
  data date NOT NULL,
  repasse_pago boolean NOT NULL DEFAULT true,
  repasse_pago_em date,
  repasse_pago_at timestamptz NOT NULL DEFAULT now(),
  repasse_forma_pagamento text,
  repasse_conta_id uuid,
  repasse_pago_por uuid REFERENCES auth.users(id),
  repasse_lancamento_id uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_repasse_terceiro_origem_coerente CHECK (
    (origem = 'agenda' AND lancamento_id IS NOT NULL AND atendimento_id IS NULL)
    OR
    (origem = 'manual' AND atendimento_id IS NOT NULL AND lancamento_id IS NULL)
  )
);

-- Trava de pagamento duplicado: um terceiro só recebe uma vez por atendimento.
CREATE UNIQUE INDEX IF NOT EXISTS uq_frt_agenda
  ON public.fin_repasse_terceiro(lancamento_id, terceiro_medico_id)
  WHERE lancamento_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_frt_manual
  ON public.fin_repasse_terceiro(atendimento_id, terceiro_medico_id)
  WHERE atendimento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_frt_clinica_data
  ON public.fin_repasse_terceiro(clinica_id, data);
CREATE INDEX IF NOT EXISTS idx_frt_terceiro
  ON public.fin_repasse_terceiro(terceiro_medico_id);

ALTER TABLE public.fin_repasse_terceiro ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.fin_repasse_terceiro TO authenticated;
GRANT DELETE ON public.fin_repasse_terceiro TO authenticated;
GRANT ALL ON public.fin_repasse_terceiro TO service_role;

DROP POLICY IF EXISTS frt_select ON public.fin_repasse_terceiro;
CREATE POLICY frt_select ON public.fin_repasse_terceiro
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));

DROP POLICY IF EXISTS frt_insert ON public.fin_repasse_terceiro;
CREATE POLICY frt_insert ON public.fin_repasse_terceiro
  FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid(), clinica_id));

DROP POLICY IF EXISTS frt_update ON public.fin_repasse_terceiro;
CREATE POLICY frt_update ON public.fin_repasse_terceiro
  FOR UPDATE TO authenticated USING (public.is_member(auth.uid(), clinica_id));

DROP POLICY IF EXISTS frt_delete ON public.fin_repasse_terceiro;
CREATE POLICY frt_delete ON public.fin_repasse_terceiro
  FOR DELETE TO authenticated USING (public.can_manage_clinica(auth.uid(), clinica_id));

COMMENT ON TABLE public.fin_repasse_terceiro IS
  'Repasses de terceiro (dono de equipamento) já pagos. Uma linha por atendimento × terceiro.';

-- 3) Pagamento em uma única transação --------------------------------------
-- Paga o repasse do médico executante (reaproveitando a RPC já existente, com
-- todas as travas dela) e, no mesmo COMMIT, gera um lançamento de despesa
-- SEPARADO para cada terceiro. Se qualquer parte falhar, o Postgres desfaz
-- tudo — nunca fica o executante pago e o terceiro sem crédito, nem o
-- contrário.
--
-- _terceiros: [{ terceiro_id, terceiro_nome, total,
--                itens: [{ origem:'agenda'|'manual', id, valor, percentual, data }] }]
CREATE OR REPLACE FUNCTION public.pagar_repasse_medico_com_terceiros(
  _clinica_id uuid,
  _medico_id uuid,
  _manual_ids uuid[],
  _agenda_ids uuid[],
  _total numeric,
  _data date,
  _forma_pagamento text,
  _conta_id uuid,
  _criado_por uuid,
  _medico_nome text,
  _terceiros jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_lanc_exec uuid;
  v_elem jsonb;
  v_item jsonb;
  v_terceiro_id uuid;
  v_terceiro_nome text;
  v_total_terceiro numeric;
  v_soma numeric;
  v_qtd integer;
  v_lanc_terceiro uuid;
  v_origem text;
  v_ref uuid;
  v_valor numeric;
  v_out jsonb := '[]'::jsonb;
BEGIN
  -- Repasse do executante: mesmas validações de sempre (atendimento realizado,
  -- data liberada, nada pago em duplicidade).
  v_lanc_exec := public.pagar_repasse_medico(
    _clinica_id, _medico_id, _manual_ids, _agenda_ids, _total, _data,
    _forma_pagamento, _conta_id, _criado_por, _medico_nome
  );

  FOR v_elem IN SELECT value FROM jsonb_array_elements(COALESCE(_terceiros, '[]'::jsonb))
  LOOP
    v_terceiro_id := NULLIF(v_elem->>'terceiro_id','')::uuid;
    v_terceiro_nome := COALESCE(NULLIF(btrim(v_elem->>'terceiro_nome'), ''), 'Terceiro');
    v_total_terceiro := round(COALESCE((v_elem->>'total')::numeric, 0), 2);

    IF v_terceiro_id IS NULL THEN
      RAISE EXCEPTION 'Repasse de terceiro sem médico informado.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM medicos m WHERE m.id = v_terceiro_id AND m.clinica_id = _clinica_id
    ) THEN
      RAISE EXCEPTION 'O médico terceiro informado não pertence a esta clínica.'
        USING errcode = '42501';
    END IF;
    IF v_terceiro_id = _medico_id THEN
      RAISE EXCEPTION 'O terceiro não pode ser o próprio médico executante.'
        USING errcode = '23514';
    END IF;
    CONTINUE WHEN v_total_terceiro <= 0;

    -- Os itens precisam fazer parte do MESMO lote que acabou de ser pago, e a
    -- soma deles precisa bater com o total do terceiro.
    v_soma := 0;
    v_qtd := 0;
    FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(v_elem->'itens', '[]'::jsonb))
    LOOP
      v_origem := v_item->>'origem';
      v_ref := NULLIF(v_item->>'id','')::uuid;
      v_valor := round(COALESCE((v_item->>'valor')::numeric, 0), 2);
      CONTINUE WHEN v_valor <= 0;
      IF v_ref IS NULL THEN
        RAISE EXCEPTION 'Repasse de terceiro com atendimento sem identificação.';
      END IF;
      IF v_origem = 'agenda' THEN
        IF NOT (v_ref = ANY(COALESCE(_agenda_ids, '{}'::uuid[]))) THEN
          RAISE EXCEPTION 'Repasse de terceiro aponta para atendimento fora do lote pago.'
            USING errcode = '23514';
        END IF;
      ELSIF v_origem = 'manual' THEN
        IF NOT (v_ref = ANY(COALESCE(_manual_ids, '{}'::uuid[]))) THEN
          RAISE EXCEPTION 'Repasse de terceiro aponta para atendimento fora do lote pago.'
            USING errcode = '23514';
        END IF;
      ELSE
        RAISE EXCEPTION 'Origem inválida no repasse de terceiro: %', COALESCE(v_origem,'(nula)');
      END IF;
      v_soma := v_soma + v_valor;
      v_qtd := v_qtd + 1;
    END LOOP;

    CONTINUE WHEN v_qtd = 0;
    IF abs(v_soma - v_total_terceiro) > 0.05 THEN
      RAISE EXCEPTION 'Soma dos repasses de terceiro (R$ %) não confere com o total informado (R$ %).',
        v_soma, v_total_terceiro USING errcode = '23514';
    END IF;

    INSERT INTO fin_lancamentos (
      clinica_id, tipo, descricao, valor, data, data_vencimento,
      status, medico_id, conta_id, forma_pagamento, criado_por
    ) VALUES (
      _clinica_id, 'despesa',
      'Repasse terceiro — ' || v_terceiro_nome || ' (' || v_qtd || ' atend.)',
      v_total_terceiro, _data, _data,
      'confirmado', v_terceiro_id, _conta_id, _forma_pagamento, _criado_por
    )
    RETURNING id INTO v_lanc_terceiro;

    FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(v_elem->'itens', '[]'::jsonb))
    LOOP
      v_origem := v_item->>'origem';
      v_ref := NULLIF(v_item->>'id','')::uuid;
      v_valor := round(COALESCE((v_item->>'valor')::numeric, 0), 2);
      CONTINUE WHEN v_valor <= 0;
      -- O índice único abaixo é a trava contra pagar o mesmo terceiro duas
      -- vezes pelo mesmo atendimento: o erro 23505 desfaz a transação inteira.
      INSERT INTO fin_repasse_terceiro (
        clinica_id, origem,
        lancamento_id, atendimento_id,
        executante_medico_id, terceiro_medico_id,
        percentual, valor, data,
        repasse_pago, repasse_pago_em, repasse_pago_at,
        repasse_forma_pagamento, repasse_conta_id, repasse_pago_por,
        repasse_lancamento_id
      ) VALUES (
        _clinica_id, v_origem,
        CASE WHEN v_origem = 'agenda' THEN v_ref END,
        CASE WHEN v_origem = 'manual' THEN v_ref END,
        _medico_id, v_terceiro_id,
        NULLIF(v_item->>'percentual','')::numeric, v_valor,
        COALESCE(NULLIF(v_item->>'data','')::date, _data),
        true, _data, now(),
        _forma_pagamento, _conta_id, _criado_por,
        v_lanc_terceiro
      );
    END LOOP;

    v_out := v_out || jsonb_build_object(
      'terceiro_id', v_terceiro_id,
      'terceiro_nome', v_terceiro_nome,
      'lancamento_id', v_lanc_terceiro,
      'total', v_total_terceiro,
      'qtd', v_qtd
    );
  END LOOP;

  RETURN jsonb_build_object('lancamento_id', v_lanc_exec, 'terceiros', v_out);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pagar_repasse_medico_com_terceiros(uuid,uuid,uuid[],uuid[],numeric,date,text,uuid,uuid,text,jsonb) FROM public;
REVOKE EXECUTE ON FUNCTION public.pagar_repasse_medico_com_terceiros(uuid,uuid,uuid[],uuid[],numeric,date,text,uuid,uuid,text,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.pagar_repasse_medico_com_terceiros(uuid,uuid,uuid[],uuid[],numeric,date,text,uuid,uuid,text,jsonb) TO authenticated;
