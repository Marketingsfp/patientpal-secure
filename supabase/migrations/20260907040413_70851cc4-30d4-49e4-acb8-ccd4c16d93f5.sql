ALTER TABLE public.nina_teste_simulacoes
  ADD COLUMN IF NOT EXISTS max_mensagens integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS max_custo_creditos numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS creditos_por_mil_tokens numeric NOT NULL DEFAULT 0;