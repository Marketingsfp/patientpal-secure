-- Tabela de regras de preço por convênio
CREATE TABLE public.cb_convenio_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  convenio_id uuid NOT NULL REFERENCES public.cb_convenios(id) ON DELETE CASCADE,
  especialidade_id uuid REFERENCES public.especialidades(id) ON DELETE CASCADE,
  tipo text CHECK (tipo IN ('consulta','exame','procedimento')),
  nome_padrao text,
  modo text NOT NULL CHECK (modo IN ('valor_fixo','percentual_desconto')),
  valor numeric(12,2),
  percentual numeric(5,2),
  prioridade integer NOT NULL DEFAULT 1,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cb_convenio_regras_valor_check CHECK (
    (modo = 'valor_fixo' AND valor IS NOT NULL) OR
    (modo = 'percentual_desconto' AND percentual IS NOT NULL)
  )
);

CREATE INDEX idx_cb_convenio_regras_convenio ON public.cb_convenio_regras(convenio_id, ativo);
CREATE INDEX idx_cb_convenio_regras_match ON public.cb_convenio_regras(convenio_id, especialidade_id, tipo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cb_convenio_regras TO authenticated;
GRANT ALL ON public.cb_convenio_regras TO service_role;

ALTER TABLE public.cb_convenio_regras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cb_convenio_regras_select" ON public.cb_convenio_regras
  FOR SELECT TO authenticated
  USING (is_member(auth.uid(), clinica_id));

CREATE POLICY "cb_convenio_regras_insert" ON public.cb_convenio_regras
  FOR INSERT TO authenticated
  WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "cb_convenio_regras_update" ON public.cb_convenio_regras
  FOR UPDATE TO authenticated
  USING (can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "cb_convenio_regras_delete" ON public.cb_convenio_regras
  FOR DELETE TO authenticated
  USING (can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_cb_convenio_regras_updated
  BEFORE UPDATE ON public.cb_convenio_regras
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();