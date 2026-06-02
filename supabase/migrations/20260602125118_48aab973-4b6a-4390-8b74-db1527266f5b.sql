
CREATE TABLE public.procedimento_cb_convenio_valores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  procedimento_id uuid NOT NULL REFERENCES public.procedimentos(id) ON DELETE CASCADE,
  convenio_id uuid NOT NULL REFERENCES public.cb_convenios(id) ON DELETE CASCADE,
  valor_dinheiro numeric(10,2) NOT NULL DEFAULT 0,
  valor_outros numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (procedimento_id, convenio_id)
);

CREATE INDEX idx_pcv_clinica ON public.procedimento_cb_convenio_valores(clinica_id);
CREATE INDEX idx_pcv_proc ON public.procedimento_cb_convenio_valores(procedimento_id);
CREATE INDEX idx_pcv_conv ON public.procedimento_cb_convenio_valores(convenio_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procedimento_cb_convenio_valores TO authenticated;
GRANT ALL ON public.procedimento_cb_convenio_valores TO service_role;

ALTER TABLE public.procedimento_cb_convenio_valores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ver valores convenio"
  ON public.procedimento_cb_convenio_valores FOR SELECT
  USING (is_member(auth.uid(), clinica_id));

CREATE POLICY "Gestores podem criar valores convenio"
  ON public.procedimento_cb_convenio_valores FOR INSERT
  WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "Gestores podem atualizar valores convenio"
  ON public.procedimento_cb_convenio_valores FOR UPDATE
  USING (can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "Gestores podem excluir valores convenio"
  ON public.procedimento_cb_convenio_valores FOR DELETE
  USING (can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_pcv_updated
  BEFORE UPDATE ON public.procedimento_cb_convenio_valores
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
