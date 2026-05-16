
CREATE TYPE public.agendamento_status AS ENUM ('agendado', 'confirmado', 'realizado', 'cancelado', 'faltou');

CREATE TABLE public.agendamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  paciente_id uuid,
  medico_id uuid,
  paciente_nome text NOT NULL,
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  procedimento text,
  status public.agendamento_status NOT NULL DEFAULT 'agendado',
  observacoes text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agendamentos_clinica_inicio ON public.agendamentos(clinica_id, inicio);
CREATE INDEX idx_agendamentos_medico ON public.agendamentos(medico_id, inicio);

ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY agend_select ON public.agendamentos FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY agend_insert ON public.agendamentos FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), clinica_id));
CREATE POLICY agend_update ON public.agendamentos FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY agend_delete ON public.agendamentos FOR DELETE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER agendamentos_touch BEFORE UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
