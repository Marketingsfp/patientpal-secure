ALTER TABLE public.nina_teste_cenarios ADD COLUMN IF NOT EXISTS handoff_esperado boolean;
ALTER TABLE public.nina_teste_execucao_itens ADD COLUMN IF NOT EXISTS desfecho text;
ALTER TABLE public.nina_teste_execucao_itens ADD COLUMN IF NOT EXISTS handoff_esperado boolean;
ALTER TABLE public.nina_teste_execucao_itens DROP CONSTRAINT IF EXISTS nina_teste_execucao_itens_desfecho_chk;
ALTER TABLE public.nina_teste_execucao_itens ADD CONSTRAINT nina_teste_execucao_itens_desfecho_chk CHECK (desfecho IS NULL OR desfecho IN ('handoff','concluido','limite_turnos','erro','interrompido'));