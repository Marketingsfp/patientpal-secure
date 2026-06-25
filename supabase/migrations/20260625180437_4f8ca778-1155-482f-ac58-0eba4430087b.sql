
CREATE TABLE IF NOT EXISTS public.agendamento_orcamento_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  agendamento_id UUID NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  orcamento_id UUID NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
  orcamento_item_id UUID NOT NULL REFERENCES public.orcamento_itens(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (agendamento_id, orcamento_item_id)
);

CREATE INDEX IF NOT EXISTS idx_agorcit_orc ON public.agendamento_orcamento_itens(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_agorcit_ag ON public.agendamento_orcamento_itens(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_agorcit_clinica ON public.agendamento_orcamento_itens(clinica_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agendamento_orcamento_itens TO authenticated;
GRANT ALL ON public.agendamento_orcamento_itens TO service_role;

ALTER TABLE public.agendamento_orcamento_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros da clinica gerenciam vinculos"
  ON public.agendamento_orcamento_itens
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinica_memberships cm
      WHERE cm.clinica_id = agendamento_orcamento_itens.clinica_id
        AND cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinica_memberships cm
      WHERE cm.clinica_id = agendamento_orcamento_itens.clinica_id
        AND cm.user_id = auth.uid()
    )
  );

-- Backfill: para cada agendamento ativo com orcamento_id, marca todos os
-- itens daquele orçamento como consumidos por esse agendamento.
INSERT INTO public.agendamento_orcamento_itens (clinica_id, agendamento_id, orcamento_id, orcamento_item_id)
SELECT a.clinica_id, a.id, a.orcamento_id, oi.id
FROM public.agendamentos a
JOIN public.orcamento_itens oi ON oi.orcamento_id = a.orcamento_id
WHERE a.orcamento_id IS NOT NULL
  AND a.status <> 'cancelado'
ON CONFLICT (agendamento_id, orcamento_item_id) DO NOTHING;
