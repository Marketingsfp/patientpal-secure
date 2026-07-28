-- =========================================================
-- Elimina "misto" do Movimento de Caixa (decomposição automática)
-- =========================================================

-- 1) Parser: extrai as parcelas de um texto "PAGAMENTO MISTO: ..."
CREATE OR REPLACE FUNCTION public._parse_misto_obs(p_obs text)
RETURNS TABLE(forma text, valor numeric)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_texto text;
  v_parte text;
  v_upper text;
  v_forma text;
  v_val   numeric;
  v_marker_pos int;
BEGIN
  IF p_obs IS NULL THEN RETURN; END IF;
  v_marker_pos := position(lower('misto:') in lower(p_obs));
  IF v_marker_pos = 0 THEN RETURN; END IF;
  v_texto := substring(p_obs from v_marker_pos + length('misto:'));
  -- corta em " | " (a parte antes de " | " são as parcelas)
  v_texto := split_part(v_texto, ' | ', 1);

  FOREACH v_parte IN ARRAY string_to_array(v_texto, ';') LOOP
    v_parte := trim(v_parte);
    IF v_parte = '' THEN CONTINUE; END IF;
    v_upper := upper(v_parte);

    IF v_upper LIKE 'CARTAO CREDITO%' OR v_upper LIKE 'CARTÃO CRÉDITO%' OR v_upper LIKE 'CARTAO DE CREDITO%' THEN
      v_forma := 'cartao_credito';
    ELSIF v_upper LIKE 'CARTAO DEBITO%' OR v_upper LIKE 'CARTÃO DÉBITO%' OR v_upper LIKE 'CARTAO DE DEBITO%' THEN
      v_forma := 'cartao_debito';
    ELSIF v_upper LIKE 'DINHEIRO%' THEN
      v_forma := 'dinheiro';
    ELSIF v_upper LIKE 'PIX%' THEN
      v_forma := 'pix';
    ELSIF v_upper LIKE 'BOLETO%' THEN
      v_forma := 'boleto';
    ELSIF v_upper LIKE 'TRANSFERENCIA%' OR v_upper LIKE 'TRANSFERÊNCIA%' THEN
      v_forma := 'transferencia';
    ELSIF v_upper LIKE 'CONVENIO%' OR v_upper LIKE 'CONVÊNIO%' THEN
      v_forma := 'convenio';
    ELSE
      v_forma := 'outros';
    END IF;

    -- extrai o primeiro número "1.234,56" ou "1234.56"
    v_val := NULL;
    DECLARE v_match text;
    BEGIN
      v_match := (regexp_matches(v_parte, 'R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+(?:[.,][0-9]{1,2})?)'))[1];
      IF v_match IS NOT NULL THEN
        -- remove milhar '.', troca ',' decimal por '.'
        v_match := replace(v_match, '.', '');
        v_match := replace(v_match, ',', '.');
        v_val := v_match::numeric;
      END IF;
    EXCEPTION WHEN OTHERS THEN v_val := NULL;
    END;

    IF v_val IS NOT NULL AND v_val > 0 THEN
      forma := v_forma;
      valor := v_val;
      RETURN NEXT;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

-- 2) Trigger BEFORE INSERT: se forma_pagamento='misto', quebra em N linhas
CREATE OR REPLACE FUNCTION public.fn_split_misto_caixa_mov()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obs      text;
  v_partes   record;
  v_total    numeric := 0;
  v_soma     numeric := 0;
  v_qtd      int := 0;
  v_ajuste   numeric;
  v_ultimo_id uuid;
  v_desc     text;
BEGIN
  IF lower(coalesce(NEW.forma_pagamento,'')) <> 'misto' THEN
    RETURN NEW;
  END IF;

  -- Busca observações do lançamento vinculado
  IF NEW.lancamento_id IS NOT NULL THEN
    SELECT observacoes INTO v_obs FROM public.fin_lancamentos WHERE id = NEW.lancamento_id;
  END IF;

  -- Se não há obs decomponível, mantém como estava (fallback seguro)
  IF v_obs IS NULL OR position(lower('misto:') in lower(v_obs)) = 0 THEN
    RETURN NEW;
  END IF;

  v_total := NEW.valor;
  -- Soma parcelas para calcular ajuste de arredondamento
  SELECT COALESCE(SUM(valor),0), COUNT(*) INTO v_soma, v_qtd
    FROM public._parse_misto_obs(v_obs);

  IF v_qtd = 0 OR v_soma = 0 THEN
    RETURN NEW;
  END IF;

  v_ajuste := v_total - v_soma; -- corrige diferenças de centavo

  v_desc := COALESCE(NEW.descricao,'');

  -- Insere N linhas reais
  FOR v_partes IN
    SELECT row_number() OVER () AS rn, forma, valor
    FROM public._parse_misto_obs(v_obs)
  LOOP
    INSERT INTO public.caixa_movimentos (
      sessao_id, clinica_id, user_id, tipo, valor, descricao,
      forma_pagamento, lancamento_id, created_at,
      destino_user_id, destino_nome
    )
    VALUES (
      NEW.sessao_id, NEW.clinica_id, NEW.user_id, NEW.tipo,
      CASE WHEN v_partes.rn = v_qtd THEN v_partes.valor + v_ajuste ELSE v_partes.valor END,
      v_desc,
      v_partes.forma, NEW.lancamento_id, COALESCE(NEW.created_at, now()),
      NEW.destino_user_id, NEW.destino_nome
    );
  END LOOP;

  -- Cancela a linha "misto" original
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_split_misto_caixa_mov ON public.caixa_movimentos;
CREATE TRIGGER trg_split_misto_caixa_mov
BEFORE INSERT ON public.caixa_movimentos
FOR EACH ROW
EXECUTE FUNCTION public.fn_split_misto_caixa_mov();

-- 3) Backfill: decompõe todos os movimentos misto já existentes.
-- Estratégia: para cada movimento misto, insere as N linhas equivalentes
-- e depois remove a linha original.
DO $backfill$
DECLARE
  m record;
  v_obs text;
  v_soma numeric;
  v_qtd int;
  v_ajuste numeric;
  v_partes record;
BEGIN
  FOR m IN
    SELECT cm.*, fl.observacoes
    FROM public.caixa_movimentos cm
    LEFT JOIN public.fin_lancamentos fl ON fl.id = cm.lancamento_id
    WHERE lower(coalesce(cm.forma_pagamento,'')) = 'misto'
  LOOP
    v_obs := m.observacoes;
    IF v_obs IS NULL OR position(lower('misto:') in lower(v_obs)) = 0 THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(valor),0), COUNT(*) INTO v_soma, v_qtd
      FROM public._parse_misto_obs(v_obs);

    IF v_qtd = 0 OR v_soma = 0 THEN CONTINUE; END IF;

    v_ajuste := m.valor - v_soma;

    FOR v_partes IN
      SELECT row_number() OVER () AS rn, forma, valor
      FROM public._parse_misto_obs(v_obs)
    LOOP
      INSERT INTO public.caixa_movimentos (
        sessao_id, clinica_id, user_id, tipo, valor, descricao,
        forma_pagamento, lancamento_id, created_at,
        destino_user_id, destino_nome
      )
      VALUES (
        m.sessao_id, m.clinica_id, m.user_id, m.tipo,
        CASE WHEN v_partes.rn = v_qtd THEN v_partes.valor + v_ajuste ELSE v_partes.valor END,
        m.descricao,
        v_partes.forma, m.lancamento_id, m.created_at,
        m.destino_user_id, m.destino_nome
      );
    END LOOP;

    DELETE FROM public.caixa_movimentos WHERE id = m.id;
  END LOOP;
END;
$backfill$;
