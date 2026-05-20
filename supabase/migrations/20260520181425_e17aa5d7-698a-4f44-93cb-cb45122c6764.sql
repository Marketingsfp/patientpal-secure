-- Estado de cada dente/face
CREATE TYPE public.odonto_status AS ENUM (
  'higido','cariado','restaurado','ausente','extracao_indicada','tratamento_canal','coroa','implante','protese','fratura'
);

CREATE TABLE public.odonto_prontuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  paciente_id uuid NOT NULL,
  queixa_principal text,
  historia_dental text,
  plano_tratamento text,
  observacoes text,
  ultima_atualizacao_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, paciente_id)
);

CREATE INDEX idx_odonto_prontuarios_paciente ON public.odonto_prontuarios(paciente_id);

CREATE TABLE public.odonto_dentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  paciente_id uuid NOT NULL,
  dente smallint NOT NULL, -- numeração FDI 11-48, decíduos 51-85
  face text NOT NULL DEFAULT 'O', -- V/M/D/L/O (vestibular, mesial, distal, lingual, oclusal)
  status public.odonto_status NOT NULL DEFAULT 'higido',
  procedimento text,
  observacoes text,
  data date NOT NULL DEFAULT CURRENT_DATE,
  profissional_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_odonto_dentes_paciente ON public.odonto_dentes(paciente_id, dente);

ALTER TABLE public.odonto_prontuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odonto_dentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY op_select ON public.odonto_prontuarios FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY op_insert ON public.odonto_prontuarios FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY op_update ON public.odonto_prontuarios FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY op_delete ON public.odonto_prontuarios FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY od_select ON public.odonto_dentes FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY od_insert ON public.odonto_dentes FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY od_update ON public.odonto_dentes FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY od_delete ON public.odonto_dentes FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_op_updated BEFORE UPDATE ON public.odonto_prontuarios FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_od_updated BEFORE UPDATE ON public.odonto_dentes FOR EACH ROW EXECUTE FUNCTION touch_updated_at();