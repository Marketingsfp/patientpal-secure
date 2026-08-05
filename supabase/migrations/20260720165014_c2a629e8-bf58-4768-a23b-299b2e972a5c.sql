
-- Anamnese odontológica estruturada (uma linha por paciente/clínica)
CREATE TABLE IF NOT EXISTS public.odonto_anamnese (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  paciente_id uuid NOT NULL,
  em_tratamento_medico boolean,
  em_tratamento_desc text,
  medicamentos text,
  alergias text,
  doencas text,
  cirurgias text,
  gestante boolean,
  fumante boolean,
  bebida_alcoolica boolean,
  bruxismo boolean,
  sangramento_gengival boolean,
  sensibilidade boolean,
  ultima_visita_dentista text,
  motivo_consulta text,
  observacoes text,
  respondida_em timestamptz DEFAULT now(),
  respondida_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, paciente_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.odonto_anamnese TO authenticated;
GRANT ALL ON public.odonto_anamnese TO service_role;

ALTER TABLE public.odonto_anamnese ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oan_select" ON public.odonto_anamnese FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "oan_insert" ON public.odonto_anamnese FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY "oan_update" ON public.odonto_anamnese FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "oan_delete" ON public.odonto_anamnese FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_odonto_anamnese_upd BEFORE UPDATE ON public.odonto_anamnese
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_odonto_anamnese_pac ON public.odonto_anamnese (clinica_id, paciente_id);

-- Timeline de evolução clínica odontológica
CREATE TABLE IF NOT EXISTS public.odonto_evolucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  paciente_id uuid NOT NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  titulo text,
  descricao text NOT NULL,
  procedimento text,
  dentes smallint[],
  anexos jsonb,
  profissional_id uuid,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.odonto_evolucoes TO authenticated;
GRANT ALL ON public.odonto_evolucoes TO service_role;

ALTER TABLE public.odonto_evolucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oev_select" ON public.odonto_evolucoes FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "oev_insert" ON public.odonto_evolucoes FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY "oev_update" ON public.odonto_evolucoes FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "oev_delete" ON public.odonto_evolucoes FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_odonto_evolucoes_upd BEFORE UPDATE ON public.odonto_evolucoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_odonto_evolucoes_pac ON public.odonto_evolucoes (clinica_id, paciente_id, data DESC);
