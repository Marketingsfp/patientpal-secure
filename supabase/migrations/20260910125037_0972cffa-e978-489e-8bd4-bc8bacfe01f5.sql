ALTER TABLE public.nina_confianca_decisoes
  ADD COLUMN IF NOT EXISTS config_id text,
  ADD COLUMN IF NOT EXISTS config_origem text,
  ADD COLUMN IF NOT EXISTS etapa_ativacao text;

COMMENT ON COLUMN public.nina_confianca_decisoes.config_id IS
  'Identidade da configuracao efetiva usada nesta avaliacao (hash dos parametros).';
COMMENT ON COLUMN public.nina_confianca_decisoes.config_origem IS
  'padrao | clinica | cache_vencido | fallback_padrao.';

ALTER TABLE public.nina_confianca_propostas
  DROP CONSTRAINT IF EXISTS nina_confianca_propostas_status_chk;
ALTER TABLE public.nina_confianca_propostas
  ADD CONSTRAINT nina_confianca_propostas_status_chk
  CHECK (status = ANY (ARRAY[
    'pendente','aprovada','rejeitada','aplicada','revertida','implementacao_pendente'
  ]));

CREATE OR REPLACE FUNCTION public.nina_confianca_propostas_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IN ('aprovada','rejeitada') AND NEW.decidido_por IS NULL THEN
    RAISE EXCEPTION 'Decisao de proposta exige responsavel humano (decidido_por).';
  END IF;
  IF NEW.status = 'aplicada' THEN
    IF OLD.status <> 'aprovada' AND OLD.status <> 'aplicada' THEN
      RAISE EXCEPTION 'Proposta so pode ser aplicada apos aprovacao.';
    END IF;
    IF NEW.aplicado_por IS NULL THEN
      RAISE EXCEPTION 'Aplicacao de proposta exige responsavel humano (aplicado_por).';
    END IF;
  END IF;
  IF NEW.status = 'implementacao_pendente' THEN
    IF OLD.status NOT IN ('aprovada','implementacao_pendente') THEN
      RAISE EXCEPTION 'Implementacao pendente so vale apos aprovacao.';
    END IF;
    IF NEW.decidido_por IS NULL THEN
      RAISE EXCEPTION 'Implementacao pendente exige responsavel humano (decidido_por).';
    END IF;
  END IF;
  IF NEW.status = 'revertida' THEN
    IF OLD.status <> 'aplicada' THEN
      RAISE EXCEPTION 'So e possivel reverter uma proposta em vigor.';
    END IF;
    IF NEW.decidido_por IS NULL THEN
      RAISE EXCEPTION 'Reversao de proposta exige responsavel humano (decidido_por).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;