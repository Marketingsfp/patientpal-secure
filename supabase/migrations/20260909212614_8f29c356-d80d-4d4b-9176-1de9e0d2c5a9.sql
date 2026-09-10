CREATE TABLE IF NOT EXISTS public.nina_conversa_locks (
  chave text PRIMARY KEY,
  clinica_id uuid NOT NULL,
  conversa_id uuid,
  token uuid NOT NULL,
  batch_id uuid,
  adquirido_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  liberado_em timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nina_conversa_locks_expira_idx
  ON public.nina_conversa_locks (expira_em);

GRANT SELECT ON public.nina_conversa_locks TO authenticated;
GRANT ALL ON public.nina_conversa_locks TO service_role;
ALTER TABLE public.nina_conversa_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nina_conversa_locks_select ON public.nina_conversa_locks;
CREATE POLICY nina_conversa_locks_select
  ON public.nina_conversa_locks FOR SELECT TO authenticated
  USING (clinica_id IS NOT NULL AND public.is_member(auth.uid(), clinica_id));

-- Exclusão mútua entre instâncias: só um vencedor por conversa.
-- Lease com expiração evita trava presa quando a execução falha.
CREATE OR REPLACE FUNCTION public.nina_lock_adquirir(
  _chave text,
  _clinica_id uuid,
  _conversa_id uuid DEFAULT NULL,
  _batch_id uuid DEFAULT NULL,
  _lease_segundos integer DEFAULT 90
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _token uuid := gen_random_uuid();
  _ok uuid;
BEGIN
  INSERT INTO public.nina_conversa_locks
    (chave, clinica_id, conversa_id, token, batch_id, adquirido_em, expira_em, liberado_em, updated_at)
  VALUES
    (_chave, _clinica_id, _conversa_id, _token, _batch_id, now(),
     now() + make_interval(secs => GREATEST(_lease_segundos, 5)), NULL, now())
  ON CONFLICT (chave) DO UPDATE
     SET token = EXCLUDED.token,
         clinica_id = EXCLUDED.clinica_id,
         conversa_id = COALESCE(EXCLUDED.conversa_id, public.nina_conversa_locks.conversa_id),
         batch_id = EXCLUDED.batch_id,
         adquirido_em = now(),
         expira_em = EXCLUDED.expira_em,
         liberado_em = NULL,
         updated_at = now()
   WHERE public.nina_conversa_locks.liberado_em IS NOT NULL
      OR public.nina_conversa_locks.expira_em <= now()
  RETURNING token INTO _ok;

  RETURN _ok; -- NULL quando outra execução está com a trava ativa
END;
$$;

CREATE OR REPLACE FUNCTION public.nina_lock_renovar(
  _chave text, _token uuid, _lease_segundos integer DEFAULT 90
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  UPDATE public.nina_conversa_locks
     SET expira_em = now() + make_interval(secs => GREATEST(_lease_segundos, 5)),
         updated_at = now()
   WHERE chave = _chave AND token = _token AND liberado_em IS NULL;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.nina_lock_liberar(_chave text, _token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  UPDATE public.nina_conversa_locks
     SET liberado_em = now(), expira_em = now(), updated_at = now()
   WHERE chave = _chave AND token = _token AND liberado_em IS NULL;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n > 0;
END;
$$;

-- Recuperação: lote reservado que nunca concluiu volta a poder ser processado.
CREATE OR REPLACE FUNCTION public.nina_batch_recuperar_travados(
  _clinica_id uuid, _telefone text, _idade_segundos integer DEFAULT 120
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  UPDATE public.nina_message_batches
     SET status = 'COLLECTING', claimed_at = NULL, revision = revision + 1
   WHERE clinica_id = _clinica_id
     AND telefone = _telefone
     AND status = 'PROCESSING'
     AND claimed_at < now() - make_interval(secs => GREATEST(_idade_segundos, 30))
     AND NOT EXISTS (
       SELECT 1 FROM public.nina_message_batches b2
       WHERE b2.clinica_id = _clinica_id AND b2.telefone = _telefone AND b2.status = 'COLLECTING'
     );
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.nina_lock_adquirir(text, uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nina_lock_renovar(text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nina_lock_liberar(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nina_batch_recuperar_travados(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nina_lock_adquirir(text, uuid, uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.nina_lock_renovar(text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.nina_lock_liberar(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.nina_batch_recuperar_travados(uuid, text, integer) TO service_role;