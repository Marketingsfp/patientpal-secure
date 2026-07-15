
-- Adiciona token público (segredo curto) por clínica para uso em URLs de painel/totem.
ALTER TABLE public.clinicas
  ADD COLUMN IF NOT EXISTS token_publico text UNIQUE;

-- Gera tokens para clínicas existentes (24 bytes → base64url ~32 chars).
UPDATE public.clinicas
SET token_publico = replace(replace(replace(encode(gen_random_bytes(24), 'base64'), '/', '_'), '+', '-'), '=', '')
WHERE token_publico IS NULL;

-- Trigger para gerar automaticamente em novas clínicas.
CREATE OR REPLACE FUNCTION public.gen_token_publico_clinica()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.token_publico IS NULL THEN
    NEW.token_publico := replace(replace(replace(encode(gen_random_bytes(24), 'base64'), '/', '_'), '+', '-'), '=', '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clinicas_token_publico ON public.clinicas;
CREATE TRIGGER trg_clinicas_token_publico
BEFORE INSERT ON public.clinicas
FOR EACH ROW EXECUTE FUNCTION public.gen_token_publico_clinica();

-- Função SECURITY DEFINER: resolve token público em dados mínimos da clínica.
-- Permite acesso anônimo sem expor a lista completa de clínicas.
CREATE OR REPLACE FUNCTION public.resolver_clinica_por_token(_token text)
RETURNS TABLE (
  id uuid,
  nome text,
  cidade text,
  estado text,
  branding jsonb,
  base_importada boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.nome, c.cidade, c.estado, c.branding, c.base_importada
  FROM public.clinicas c
  WHERE c.token_publico = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolver_clinica_por_token(text) TO anon, authenticated;
