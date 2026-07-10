
CREATE OR REPLACE FUNCTION public.fn_reset_laudo_ao_remover_repasse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(OLD.forma_pagamento, '') <> 'laudo' THEN
    RETURN OLD;
  END IF;

  IF OLD.laudo_de_atendimento_id IS NOT NULL THEN
    UPDATE public.fin_atendimentos
       SET laudo_status = NULL,
           medico_laudador_id = NULL,
           valor_laudo = 0,
           laudo_emitido_em = NULL,
           laudo_lancamento_id = NULL
     WHERE id = OLD.laudo_de_atendimento_id
       AND laudo_lancamento_id = OLD.id;
  END IF;

  UPDATE public.fin_lancamentos
     SET laudo_status = NULL,
         medico_laudador_id = NULL,
         valor_laudo = 0,
         laudo_emitido_em = NULL,
         laudo_lancamento_id = NULL
   WHERE laudo_lancamento_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_laudo_ao_remover_repasse ON public.fin_atendimentos;
CREATE TRIGGER trg_reset_laudo_ao_remover_repasse
AFTER DELETE ON public.fin_atendimentos
FOR EACH ROW EXECUTE FUNCTION public.fn_reset_laudo_ao_remover_repasse();


CREATE OR REPLACE FUNCTION public.fn_reset_laudo_ao_cancelar_repasse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status <> 'cancelado' OR OLD.status = 'cancelado' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.forma_pagamento, '') <> 'laudo' THEN
    RETURN NEW;
  END IF;

  IF NEW.laudo_de_atendimento_id IS NOT NULL THEN
    UPDATE public.fin_atendimentos
       SET laudo_status = NULL,
           medico_laudador_id = NULL,
           valor_laudo = 0,
           laudo_emitido_em = NULL,
           laudo_lancamento_id = NULL
     WHERE id = NEW.laudo_de_atendimento_id
       AND laudo_lancamento_id = NEW.id;
  END IF;

  UPDATE public.fin_lancamentos
     SET laudo_status = NULL,
         medico_laudador_id = NULL,
         valor_laudo = 0,
         laudo_emitido_em = NULL,
         laudo_lancamento_id = NULL
   WHERE laudo_lancamento_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_laudo_ao_cancelar_repasse ON public.fin_atendimentos;
CREATE TRIGGER trg_reset_laudo_ao_cancelar_repasse
AFTER UPDATE OF status ON public.fin_atendimentos
FOR EACH ROW EXECUTE FUNCTION public.fn_reset_laudo_ao_cancelar_repasse();


-- Saneamento
UPDATE public.fin_lancamentos fl
   SET laudo_status = NULL,
       medico_laudador_id = NULL,
       valor_laudo = 0,
       laudo_emitido_em = NULL,
       laudo_lancamento_id = NULL
 WHERE fl.laudo_status = 'emitido'
   AND (
        fl.laudo_lancamento_id IS NULL
     OR NOT EXISTS (
          SELECT 1 FROM public.fin_atendimentos fa
           WHERE fa.id = fl.laudo_lancamento_id
             AND fa.status <> 'cancelado'
        )
   );

UPDATE public.fin_atendimentos fa
   SET laudo_status = NULL,
       medico_laudador_id = NULL,
       valor_laudo = 0,
       laudo_emitido_em = NULL,
       laudo_lancamento_id = NULL
 WHERE fa.laudo_status = 'emitido'
   AND (
        fa.laudo_lancamento_id IS NULL
     OR NOT EXISTS (
          SELECT 1 FROM public.fin_atendimentos fx
           WHERE fx.id = fa.laudo_lancamento_id
             AND fx.status <> 'cancelado'
        )
   );
