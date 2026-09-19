-- Referência exclusiva de apresentação: mensagens não movem cards reais.
-- Não altera posse, distribuição, permissões, status nem histórico de mensagens.
BEGIN;

ALTER TABLE public.atend_conversas
  ADD COLUMN IF NOT EXISTS inbox_entrada_em timestamptz;

-- Usa fatos operacionais existentes; nunca a última mensagem nem o horário
-- da implantação. Uma reexecução não reinicializa posições já registradas.
UPDATE public.atend_conversas c
SET inbox_entrada_em = GREATEST(
  c.created_at, c.assigned_at, c.handoff_em,
  (SELECT max(e.created_at) FROM public.atend_conversa_eventos e
   WHERE e.conversa_id = c.id AND e.clinica_id = c.clinica_id AND e.evento = 'REABERTA')
)
WHERE c.inbox_entrada_em IS NULL;

ALTER TABLE public.atend_conversas
  ALTER COLUMN inbox_entrada_em SET DEFAULT now(),
  ALTER COLUMN inbox_entrada_em SET NOT NULL;

COMMENT ON COLUMN public.atend_conversas.inbox_entrada_em IS
  'Ordem da Inbox real: criação, reabertura, entrada na fila humana ou nova atribuição. Mensagens e primeira resposta preservam a posição.';

CREATE OR REPLACE FUNCTION public.atend_registrar_entrada_inbox()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.is_teste THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.inbox_entrada_em := statement_timestamp();
  ELSIF NEW.status NOT IN ('closed', 'finished') AND (
    OLD.status IN ('closed', 'finished')
    OR (OLD.owner_type = 'AI' AND NEW.owner_type <> 'AI')
    OR (NEW.atribuida_user_id IS NOT NULL
        AND NEW.atribuida_user_id IS DISTINCT FROM OLD.atribuida_user_id)
  ) THEN
    NEW.inbox_entrada_em := statement_timestamp();
  ELSE
    -- Inclusive atualizações de prévia, leitura, presença, resumo, prazo,
    -- assigned_at repetido e fila_pendente -> ativa após a primeira resposta.
    NEW.inbox_entrada_em := OLD.inbox_entrada_em;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_atend_registrar_entrada_inbox
BEFORE INSERT OR UPDATE ON public.atend_conversas
FOR EACH ROW EXECUTE FUNCTION public.atend_registrar_entrada_inbox();

CREATE INDEX IF NOT EXISTS atend_inbox_entrada_idx
  ON public.atend_conversas (clinica_id, inbox_entrada_em DESC, id ASC)
  WHERE is_teste = false;

NOTIFY pgrst, 'reload schema';
COMMIT;
