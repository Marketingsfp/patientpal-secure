ALTER TABLE public.nina_confianca_decisoes
  ADD COLUMN IF NOT EXISTS policy_version text;

UPDATE public.nina_confianca_decisoes SET policy_version = 'desconhecida' WHERE policy_version IS NULL;

CREATE INDEX IF NOT EXISTS nina_confianca_decisoes_clinica_execucao_idx
  ON public.nina_confianca_decisoes (clinica_id, execucao_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.nina_confianca_decisoes_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'nina_confianca_decisoes e um registro historico imutavel: alteracao/exclusao nao permitida';
END;
$$;

DROP TRIGGER IF EXISTS nina_confianca_decisoes_no_update ON public.nina_confianca_decisoes;
CREATE TRIGGER nina_confianca_decisoes_no_update
  BEFORE UPDATE OR DELETE ON public.nina_confianca_decisoes
  FOR EACH ROW EXECUTE FUNCTION public.nina_confianca_decisoes_imutavel();