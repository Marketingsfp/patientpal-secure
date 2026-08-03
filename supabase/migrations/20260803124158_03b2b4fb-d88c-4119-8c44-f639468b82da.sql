CREATE TABLE IF NOT EXISTS public.enfermagem_recursos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  cor text,
  duracao_padrao_min integer NOT NULL DEFAULT 30,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enf_recursos_clinica ON public.enfermagem_recursos(clinica_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enfermagem_recursos TO authenticated;
GRANT ALL ON public.enfermagem_recursos TO service_role;
ALTER TABLE public.enfermagem_recursos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "membros leem recursos" ON public.enfermagem_recursos;
CREATE POLICY "membros leem recursos" ON public.enfermagem_recursos
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
DROP POLICY IF EXISTS "gestores gerenciam recursos" ON public.enfermagem_recursos;
CREATE POLICY "gestores gerenciam recursos" ON public.enfermagem_recursos
  FOR ALL TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE TABLE IF NOT EXISTS public.enfermagem_recurso_disponibilidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  recurso_id uuid NOT NULL REFERENCES public.enfermagem_recursos(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio time NOT NULL,
  hora_fim time NOT NULL,
  intervalo_min integer,
  limite_pacientes integer,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enf_disp_recurso ON public.enfermagem_recurso_disponibilidades(recurso_id, dia_semana);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enfermagem_recurso_disponibilidades TO authenticated;
GRANT ALL ON public.enfermagem_recurso_disponibilidades TO service_role;
ALTER TABLE public.enfermagem_recurso_disponibilidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "membros leem horarios enfermagem" ON public.enfermagem_recurso_disponibilidades;
CREATE POLICY "membros leem horarios enfermagem" ON public.enfermagem_recurso_disponibilidades
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
DROP POLICY IF EXISTS "gestores gerenciam horarios enfermagem" ON public.enfermagem_recurso_disponibilidades;
CREATE POLICY "gestores gerenciam horarios enfermagem" ON public.enfermagem_recurso_disponibilidades
  FOR ALL TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE TABLE IF NOT EXISTS public.enfermagem_recurso_procedimentos (
  recurso_id uuid NOT NULL REFERENCES public.enfermagem_recursos(id) ON DELETE CASCADE,
  procedimento_id uuid NOT NULL REFERENCES public.procedimentos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recurso_id, procedimento_id)
);
CREATE INDEX IF NOT EXISTS idx_enf_recproc_recurso ON public.enfermagem_recurso_procedimentos(recurso_id);
CREATE INDEX IF NOT EXISTS idx_enf_recproc_proc ON public.enfermagem_recurso_procedimentos(procedimento_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enfermagem_recurso_procedimentos TO authenticated;
GRANT ALL ON public.enfermagem_recurso_procedimentos TO service_role;
ALTER TABLE public.enfermagem_recurso_procedimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "membros leem vinculos" ON public.enfermagem_recurso_procedimentos;
CREATE POLICY "membros leem vinculos" ON public.enfermagem_recurso_procedimentos
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.enfermagem_recursos r WHERE r.id = recurso_id AND public.is_member(auth.uid(), r.clinica_id)));
DROP POLICY IF EXISTS "gestores gerenciam vinculos" ON public.enfermagem_recurso_procedimentos;
CREATE POLICY "gestores gerenciam vinculos" ON public.enfermagem_recurso_procedimentos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.enfermagem_recursos r WHERE r.id = recurso_id AND public.can_manage_clinica(auth.uid(), r.clinica_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.enfermagem_recursos r WHERE r.id = recurso_id AND public.can_manage_clinica(auth.uid(), r.clinica_id)));

CREATE TABLE IF NOT EXISTS public.enfermagem_recurso_atendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  recurso_id uuid NOT NULL REFERENCES public.enfermagem_recursos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, recurso_id)
);
CREATE INDEX IF NOT EXISTS idx_enf_atend_user ON public.enfermagem_recurso_atendentes(user_id);
CREATE INDEX IF NOT EXISTS idx_enf_atend_recurso ON public.enfermagem_recurso_atendentes(recurso_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enfermagem_recurso_atendentes TO authenticated;
GRANT ALL ON public.enfermagem_recurso_atendentes TO service_role;
ALTER TABLE public.enfermagem_recurso_atendentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "membros leem atendentes enfermagem" ON public.enfermagem_recurso_atendentes;
CREATE POLICY "membros leem atendentes enfermagem" ON public.enfermagem_recurso_atendentes
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
DROP POLICY IF EXISTS "gestores gerenciam atendentes enfermagem" ON public.enfermagem_recurso_atendentes;
CREATE POLICY "gestores gerenciam atendentes enfermagem" ON public.enfermagem_recurso_atendentes
  FOR ALL TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE TABLE IF NOT EXISTS public.planos_assinatura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'cartao_consulta',
  valor_mensal numeric NOT NULL DEFAULT 0,
  taxa_adesao numeric NOT NULL DEFAULT 0,
  max_dependentes integer NOT NULL DEFAULT 0,
  max_agregados integer NOT NULL DEFAULT 0,
  fidelidade_meses integer NOT NULL DEFAULT 6,
  vigencia_meses integer NOT NULL DEFAULT 12,
  num_parcelas integer NOT NULL DEFAULT 12,
  descricao_beneficios text,
  template_contrato text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planos_assinatura TO authenticated;
GRANT ALL ON public.planos_assinatura TO service_role;
ALTER TABLE public.planos_assinatura ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pa_select ON public.planos_assinatura;
CREATE POLICY pa_select ON public.planos_assinatura FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
DROP POLICY IF EXISTS pa_insert ON public.planos_assinatura;
CREATE POLICY pa_insert ON public.planos_assinatura FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid(), clinica_id));
DROP POLICY IF EXISTS pa_update ON public.planos_assinatura;
CREATE POLICY pa_update ON public.planos_assinatura FOR UPDATE TO authenticated USING (public.is_member(auth.uid(), clinica_id));
DROP POLICY IF EXISTS pa_delete ON public.planos_assinatura;
CREATE POLICY pa_delete ON public.planos_assinatura FOR DELETE TO authenticated USING (public.can_manage_clinica(auth.uid(), clinica_id));

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS enfermagem_recurso_id uuid REFERENCES public.enfermagem_recursos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS executado_por uuid,
  ADD COLUMN IF NOT EXISTS executado_em timestamptz;
CREATE INDEX IF NOT EXISTS idx_agend_enf_recurso ON public.agendamentos(enfermagem_recurso_id);