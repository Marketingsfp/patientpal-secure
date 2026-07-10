-- 1) Cadastro de laudadores por médico-agenda
CREATE TABLE public.medico_repasse_laudo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  agenda_medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  laudador_medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  tipo_repasse TEXT NOT NULL CHECK (tipo_repasse IN ('percentual','valor')),
  percentual NUMERIC(6,2),
  valor NUMERIC(12,2),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agenda_medico_id, laudador_medico_id),
  CHECK (
    (tipo_repasse = 'percentual' AND percentual IS NOT NULL AND percentual >= 0 AND percentual <= 100)
    OR
    (tipo_repasse = 'valor' AND valor IS NOT NULL AND valor >= 0)
  )
);

CREATE INDEX idx_mrl_agenda ON public.medico_repasse_laudo(agenda_medico_id);
CREATE INDEX idx_mrl_laudador ON public.medico_repasse_laudo(laudador_medico_id);
CREATE INDEX idx_mrl_clinica ON public.medico_repasse_laudo(clinica_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.medico_repasse_laudo TO authenticated;
GRANT ALL ON public.medico_repasse_laudo TO service_role;

ALTER TABLE public.medico_repasse_laudo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "membros da clinica leem repasse laudo"
ON public.medico_repasse_laudo FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.clinica_memberships cm
  WHERE cm.clinica_id = medico_repasse_laudo.clinica_id AND cm.user_id = auth.uid()
));

CREATE POLICY "membros da clinica escrevem repasse laudo"
ON public.medico_repasse_laudo FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.clinica_memberships cm
  WHERE cm.clinica_id = medico_repasse_laudo.clinica_id AND cm.user_id = auth.uid()
));

CREATE POLICY "membros atualizam repasse laudo"
ON public.medico_repasse_laudo FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.clinica_memberships cm
  WHERE cm.clinica_id = medico_repasse_laudo.clinica_id AND cm.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.clinica_memberships cm
  WHERE cm.clinica_id = medico_repasse_laudo.clinica_id AND cm.user_id = auth.uid()
));

CREATE POLICY "membros removem repasse laudo"
ON public.medico_repasse_laudo FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.clinica_memberships cm
  WHERE cm.clinica_id = medico_repasse_laudo.clinica_id AND cm.user_id = auth.uid()
));

CREATE OR REPLACE FUNCTION public._touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_mrl_updated_at
BEFORE UPDATE ON public.medico_repasse_laudo
FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- 2) Lote de lançamento de laudo (auditoria/reversão)
CREATE TABLE public.fin_laudo_lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  agenda_medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE RESTRICT,
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  total_ecgs INTEGER NOT NULL DEFAULT 0,
  total_repasse NUMERIC(14,2) NOT NULL DEFAULT 0,
  observacoes TEXT,
  criado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (periodo_fim >= periodo_inicio)
);

CREATE INDEX idx_fll_clinica ON public.fin_laudo_lotes(clinica_id);
CREATE INDEX idx_fll_agenda ON public.fin_laudo_lotes(agenda_medico_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_laudo_lotes TO authenticated;
GRANT ALL ON public.fin_laudo_lotes TO service_role;

ALTER TABLE public.fin_laudo_lotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "membros leem lotes laudo"
ON public.fin_laudo_lotes FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.clinica_memberships cm
  WHERE cm.clinica_id = fin_laudo_lotes.clinica_id AND cm.user_id = auth.uid()
));

CREATE POLICY "membros inserem lotes laudo"
ON public.fin_laudo_lotes FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.clinica_memberships cm
  WHERE cm.clinica_id = fin_laudo_lotes.clinica_id AND cm.user_id = auth.uid()
));

CREATE POLICY "membros atualizam lotes laudo"
ON public.fin_laudo_lotes FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.clinica_memberships cm
  WHERE cm.clinica_id = fin_laudo_lotes.clinica_id AND cm.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.clinica_memberships cm
  WHERE cm.clinica_id = fin_laudo_lotes.clinica_id AND cm.user_id = auth.uid()
));

CREATE POLICY "membros removem lotes laudo"
ON public.fin_laudo_lotes FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.clinica_memberships cm
  WHERE cm.clinica_id = fin_laudo_lotes.clinica_id AND cm.user_id = auth.uid()
));

CREATE TRIGGER trg_fll_updated_at
BEFORE UPDATE ON public.fin_laudo_lotes
FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- 3) Ligar fin_lancamentos ao lote (para reversão/rastreio)
ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS laudo_lote_id UUID REFERENCES public.fin_laudo_lotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_lanc_laudo_lote ON public.fin_lancamentos(laudo_lote_id);
