ALTER TABLE public.nina_teste_simulacoes
  ADD COLUMN IF NOT EXISTS provedor text;
ALTER TABLE public.nina_teste_carga
  ADD COLUMN IF NOT EXISTS provedor_gerador text;