CREATE TABLE IF NOT EXISTS public.nina_message_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  conversa_id uuid,
  telefone text NOT NULL,
  status text NOT NULL DEFAULT 'COLLECTING',
  revision integer NOT NULL DEFAULT 0,
  first_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  processed_at timestamptz,
  execucao_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_message_batches_status_chk
    CHECK (status IN ('COLLECTING','PROCESSING','PROCESSED','SUPERSEDED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS nina_message_batches_aberto_uniq
  ON public.nina_message_batches (clinica_id, telefone)
  WHERE status = 'COLLECTING';

CREATE INDEX IF NOT EXISTS nina_message_batches_clinica_idx
  ON public.nina_message_batches (clinica_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.nina_message_batch_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.nina_message_batches(id) ON DELETE CASCADE,
  mensagem_id uuid NOT NULL,
  ordem integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_message_batch_itens_uniq UNIQUE (batch_id, mensagem_id)
);

CREATE INDEX IF NOT EXISTS nina_message_batch_itens_batch_idx
  ON public.nina_message_batch_itens (batch_id, ordem);

GRANT SELECT ON public.nina_message_batches TO authenticated;
GRANT ALL ON public.nina_message_batches TO service_role;
GRANT SELECT ON public.nina_message_batch_itens TO authenticated;
GRANT ALL ON public.nina_message_batch_itens TO service_role;

ALTER TABLE public.nina_message_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nina_message_batch_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nina_message_batches_select ON public.nina_message_batches;
CREATE POLICY nina_message_batches_select
  ON public.nina_message_batches FOR SELECT TO authenticated
  USING (clinica_id IS NOT NULL AND public.is_member(auth.uid(), clinica_id));

DROP POLICY IF EXISTS nina_message_batch_itens_select ON public.nina_message_batch_itens;
CREATE POLICY nina_message_batch_itens_select
  ON public.nina_message_batch_itens FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.nina_message_batches b
    WHERE b.id = batch_id AND public.is_member(auth.uid(), b.clinica_id)
  ));

-- Registra a mensagem no lote aberto da conversa (cria se não houver).
CREATE OR REPLACE FUNCTION public.nina_batch_registrar(
  _clinica_id uuid,
  _telefone text,
  _conversa_id uuid,
  _mensagem_id uuid
) RETURNS TABLE (batch_id uuid, revision integer, first_message_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _b public.nina_message_batches%ROWTYPE;
  _ordem integer;
BEGIN
  LOOP
    SELECT * INTO _b FROM public.nina_message_batches
      WHERE clinica_id = _clinica_id AND telefone = _telefone AND status = 'COLLECTING'
      FOR UPDATE;
    IF FOUND THEN EXIT; END IF;
    BEGIN
      INSERT INTO public.nina_message_batches (clinica_id, telefone, conversa_id)
      VALUES (_clinica_id, _telefone, _conversa_id)
      RETURNING * INTO _b;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- outra invocação abriu o lote no mesmo instante: repete a leitura
    END;
  END LOOP;

  UPDATE public.nina_message_batches
     SET revision = revision + 1,
         last_message_at = now(),
         conversa_id = COALESCE(_conversa_id, conversa_id)
   WHERE id = _b.id
   RETURNING * INTO _b;

  SELECT COALESCE(MAX(i.ordem), 0) + 1 INTO _ordem
    FROM public.nina_message_batch_itens i WHERE i.batch_id = _b.id;

  INSERT INTO public.nina_message_batch_itens (batch_id, mensagem_id, ordem)
  VALUES (_b.id, _mensagem_id, _ordem)
  ON CONFLICT (batch_id, mensagem_id) DO NOTHING;

  batch_id := _b.id;
  revision := _b.revision;
  first_message_at := _b.first_message_at;
  RETURN NEXT;
END;
$$;

-- Reserva o lote para processamento. Só um vencedor por lote.
CREATE OR REPLACE FUNCTION public.nina_batch_reivindicar(
  _batch_id uuid,
  _revision integer,
  _forcar boolean DEFAULT false
) RETURNS TABLE (reivindicado boolean, mensagens uuid[], revision integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _b public.nina_message_batches%ROWTYPE;
BEGIN
  SELECT * INTO _b FROM public.nina_message_batches WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND OR _b.status <> 'COLLECTING'
     OR (NOT _forcar AND _b.revision <> _revision) THEN
    reivindicado := false;
    mensagens := ARRAY[]::uuid[];
    revision := COALESCE(_b.revision, 0);
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.nina_message_batches
     SET status = 'PROCESSING', claimed_at = now()
   WHERE id = _batch_id
   RETURNING * INTO _b;

  SELECT COALESCE(ARRAY_AGG(i.mensagem_id ORDER BY i.ordem), ARRAY[]::uuid[])
    INTO mensagens
    FROM public.nina_message_batch_itens i WHERE i.batch_id = _batch_id;

  reivindicado := true;
  revision := _b.revision;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.nina_batch_concluir(
  _batch_id uuid,
  _execucao_id uuid DEFAULT NULL,
  _status text DEFAULT 'PROCESSED'
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.nina_message_batches
     SET status = CASE WHEN _status IN ('PROCESSED','SUPERSEDED') THEN _status ELSE 'PROCESSED' END,
         processed_at = now(),
         execucao_id = COALESCE(_execucao_id, execucao_id)
   WHERE id = _batch_id;
$$;

REVOKE ALL ON FUNCTION public.nina_batch_registrar(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nina_batch_reivindicar(uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nina_batch_concluir(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nina_batch_registrar(uuid, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.nina_batch_reivindicar(uuid, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.nina_batch_concluir(uuid, uuid, text) TO service_role;