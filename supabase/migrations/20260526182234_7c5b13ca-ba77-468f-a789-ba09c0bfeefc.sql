ALTER TABLE public.gr_impressoes ALTER COLUMN agendamento_id DROP NOT NULL;
ALTER TABLE public.gr_impressoes ADD COLUMN mensalidade_id uuid REFERENCES public.contrato_mensalidades(id) ON DELETE CASCADE;
CREATE INDEX idx_gr_impressoes_mensalidade ON public.gr_impressoes(mensalidade_id);
ALTER TABLE public.gr_impressoes ADD CONSTRAINT gr_impressoes_target_chk CHECK ((agendamento_id IS NOT NULL) <> (mensalidade_id IS NOT NULL));