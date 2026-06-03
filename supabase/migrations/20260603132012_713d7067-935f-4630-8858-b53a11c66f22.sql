-- 1) Função de replicação a partir da Policlínica Menino Jesus
CREATE OR REPLACE FUNCTION public.replicar_procedimentos_menino_jesus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _source  uuid := '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'; -- POLICLINICA MENINO JESUS
  _targets uuid[] := ARRAY[
    'a2e1ffd6-084e-4954-84a0-8fe7788274ae', -- POLICLINICA SAO FRANCISCO DE PAULA
    'a7705bb5-4c19-425e-95cb-4aa1facc5861'  -- CLINICA CONSULTA HOJE
  ];
  _t uuid;
  _existing_id uuid;
BEGIN
  -- Evita recursão (as gravações feitas pelo próprio trigger nas clínicas-alvo
  -- também disparariam este trigger).
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.clinica_id IS DISTINCT FROM _source THEN
      RETURN NEW;
    END IF;

    FOREACH _t IN ARRAY _targets LOOP
      SELECT id INTO _existing_id
        FROM public.procedimentos
       WHERE clinica_id = _t
         AND upper(btrim(nome)) = upper(btrim(NEW.nome))
       LIMIT 1;

      IF _existing_id IS NOT NULL THEN
        UPDATE public.procedimentos SET
          nome                  = NEW.nome,
          grupo                 = NEW.grupo,
          tipo                  = NEW.tipo,
          codigo                = NEW.codigo,
          valor_padrao          = NEW.valor_padrao,
          valor_dinheiro        = NEW.valor_dinheiro,
          valor_dinheiro_pix    = NEW.valor_dinheiro_pix,
          valor_pix             = NEW.valor_pix,
          valor_cartao_credito  = NEW.valor_cartao_credito,
          valor_cartao_debito   = NEW.valor_cartao_debito,
          valor_cartao          = NEW.valor_cartao,
          valor_cartao_consulta = NEW.valor_cartao_consulta,
          valor_cartao_desconto = NEW.valor_cartao_desconto,
          duracao_minutos       = NEW.duracao_minutos,
          observacoes           = NEW.observacoes,
          preparo               = NEW.preparo,
          ativo                 = NEW.ativo
         WHERE id = _existing_id;
      ELSE
        INSERT INTO public.procedimentos (
          clinica_id, nome, grupo, tipo, codigo,
          valor_padrao, valor_dinheiro, valor_dinheiro_pix, valor_pix,
          valor_cartao_credito, valor_cartao_debito, valor_cartao,
          valor_cartao_consulta, valor_cartao_desconto,
          duracao_minutos, observacoes, preparo, ativo
        ) VALUES (
          _t, NEW.nome, NEW.grupo, NEW.tipo, NEW.codigo,
          NEW.valor_padrao, NEW.valor_dinheiro, NEW.valor_dinheiro_pix, NEW.valor_pix,
          NEW.valor_cartao_credito, NEW.valor_cartao_debito, NEW.valor_cartao,
          NEW.valor_cartao_consulta, NEW.valor_cartao_desconto,
          NEW.duracao_minutos, NEW.observacoes, NEW.preparo, NEW.ativo
        );
      END IF;
    END LOOP;

    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.clinica_id IS DISTINCT FROM _source THEN
      RETURN OLD;
    END IF;
    -- Não excluímos nas outras clínicas para não quebrar agendamentos/financeiro
    -- já vinculados — apenas marcamos como inativo.
    UPDATE public.procedimentos
       SET ativo = false
     WHERE clinica_id = ANY(_targets)
       AND upper(btrim(nome)) = upper(btrim(OLD.nome));
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_replicar_procedimentos_menino_jesus ON public.procedimentos;
CREATE TRIGGER trg_replicar_procedimentos_menino_jesus
AFTER INSERT OR UPDATE OR DELETE ON public.procedimentos
FOR EACH ROW EXECUTE FUNCTION public.replicar_procedimentos_menino_jesus();

-- 2) Sincronização inicial: atualiza os existentes (match por nome normalizado)
--    e insere os que faltam nas duas clínicas-alvo.
DO $sync$
DECLARE
  _source  uuid := '7570ddde-8c1c-4b55-ba72-cf12b2a6c940';
  _targets uuid[] := ARRAY[
    'a2e1ffd6-084e-4954-84a0-8fe7788274ae',
    'a7705bb5-4c19-425e-95cb-4aa1facc5861'
  ];
  _t uuid;
BEGIN
  FOREACH _t IN ARRAY _targets LOOP
    -- UPDATE dos existentes (match pelo nome normalizado)
    UPDATE public.procedimentos d SET
      grupo                 = s.grupo,
      tipo                  = s.tipo,
      codigo                = s.codigo,
      valor_padrao          = s.valor_padrao,
      valor_dinheiro        = s.valor_dinheiro,
      valor_dinheiro_pix    = s.valor_dinheiro_pix,
      valor_pix             = s.valor_pix,
      valor_cartao_credito  = s.valor_cartao_credito,
      valor_cartao_debito   = s.valor_cartao_debito,
      valor_cartao          = s.valor_cartao,
      valor_cartao_consulta = s.valor_cartao_consulta,
      valor_cartao_desconto = s.valor_cartao_desconto,
      duracao_minutos       = s.duracao_minutos,
      observacoes           = s.observacoes,
      preparo               = s.preparo,
      ativo                 = s.ativo,
      nome                  = s.nome
    FROM public.procedimentos s
    WHERE s.clinica_id = _source
      AND d.clinica_id = _t
      AND upper(btrim(d.nome)) = upper(btrim(s.nome));

    -- INSERT dos que faltam
    INSERT INTO public.procedimentos (
      clinica_id, nome, grupo, tipo, codigo,
      valor_padrao, valor_dinheiro, valor_dinheiro_pix, valor_pix,
      valor_cartao_credito, valor_cartao_debito, valor_cartao,
      valor_cartao_consulta, valor_cartao_desconto,
      duracao_minutos, observacoes, preparo, ativo
    )
    SELECT
      _t, s.nome, s.grupo, s.tipo, s.codigo,
      s.valor_padrao, s.valor_dinheiro, s.valor_dinheiro_pix, s.valor_pix,
      s.valor_cartao_credito, s.valor_cartao_debito, s.valor_cartao,
      s.valor_cartao_consulta, s.valor_cartao_desconto,
      s.duracao_minutos, s.observacoes, s.preparo, s.ativo
    FROM public.procedimentos s
    WHERE s.clinica_id = _source
      AND NOT EXISTS (
        SELECT 1 FROM public.procedimentos d
        WHERE d.clinica_id = _t
          AND upper(btrim(d.nome)) = upper(btrim(s.nome))
      );
  END LOOP;
END
$sync$;