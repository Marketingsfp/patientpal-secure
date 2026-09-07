CREATE TABLE IF NOT EXISTS public.nina_teste_ciclos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.nina_teste_leads(id) ON DELETE CASCADE,
  indice integer NOT NULL,
  sessao_seq integer NOT NULL,
  telefone_sessao text NOT NULL,
  conversa_id uuid REFERENCES public.atend_conversas(id) ON DELETE SET NULL,
  paciente_teste_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','resolvido')),
  criado_por uuid,
  resolvido_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nina_teste_ciclos TO authenticated;
GRANT ALL ON public.nina_teste_ciclos TO service_role;

ALTER TABLE public.nina_teste_ciclos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nina_teste_ciclos_select" ON public.nina_teste_ciclos
  FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "nina_teste_ciclos_cud" ON public.nina_teste_ciclos
  FOR ALL TO authenticated USING (is_member(auth.uid(), clinica_id))
  WITH CHECK (is_member(auth.uid(), clinica_id));

CREATE INDEX IF NOT EXISTS nina_teste_ciclos_lead_idx ON public.nina_teste_ciclos (lead_id, sessao_seq DESC);
CREATE INDEX IF NOT EXISTS nina_teste_ciclos_conversa_idx ON public.nina_teste_ciclos (conversa_id);

DROP TRIGGER IF EXISTS nina_teste_ciclos_touch ON public.nina_teste_ciclos;
CREATE TRIGGER nina_teste_ciclos_touch BEFORE UPDATE ON public.nina_teste_ciclos
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

ALTER TABLE public.nina_teste_leads
  ADD COLUMN IF NOT EXISTS ciclo_id uuid REFERENCES public.nina_teste_ciclos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ciclo_iniciado_em timestamptz,
  ADD COLUMN IF NOT EXISTS resolvido_em timestamptz,
  ADD COLUMN IF NOT EXISTS paciente_teste_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL;

ALTER TABLE public.atend_conversas
  ADD COLUMN IF NOT EXISTS teste_ciclo_id uuid REFERENCES public.nina_teste_ciclos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS atend_conversas_teste_ciclo_idx ON public.atend_conversas (teste_ciclo_id) WHERE teste_ciclo_id IS NOT NULL;