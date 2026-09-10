CREATE TABLE IF NOT EXISTS public.nina_conversa_revisoes (
  chave text PRIMARY KEY,
  clinica_id uuid NOT NULL,
  telefone text NOT NULL,
  conversa_id uuid,
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.nina_conversa_revisoes TO authenticated;
GRANT ALL ON public.nina_conversa_revisoes TO service_role;
ALTER TABLE public.nina_conversa_revisoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nina_conversa_revisoes_select ON public.nina_conversa_revisoes;
CREATE POLICY nina_conversa_revisoes_select
  ON public.nina_conversa_revisoes FOR SELECT TO authenticated
  USING (clinica_id IS NOT NULL AND public.is_member(auth.uid(), clinica_id));

-- Contador monotônico e atômico por conversa.
CREATE OR REPLACE FUNCTION public.nina_revisao_incrementar(
  _clinica_id uuid, _telefone text, _conversa_id uuid DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _rev bigint;
BEGIN
  INSERT INTO public.nina_conversa_revisoes
    (chave, clinica_id, telefone, conversa_id, revision, updated_at)
  VALUES (_clinica_id::text || ':' || _telefone, _clinica_id, _telefone, _conversa_id, 1, now())
  ON CONFLICT (chave) DO UPDATE
     SET revision = public.nina_conversa_revisoes.revision + 1,
         conversa_id = COALESCE(EXCLUDED.conversa_id, public.nina_conversa_revisoes.conversa_id),
         updated_at = now()
  RETURNING revision INTO _rev;
  RETURN _rev;
END;
$$;

CREATE OR REPLACE FUNCTION public.nina_revisao_atual(_clinica_id uuid, _telefone text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT revision FROM public.nina_conversa_revisoes
      WHERE chave = _clinica_id::text || ':' || _telefone), 0);
$$;

REVOKE ALL ON FUNCTION public.nina_revisao_incrementar(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nina_revisao_atual(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nina_revisao_incrementar(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.nina_revisao_atual(uuid, text) TO service_role;