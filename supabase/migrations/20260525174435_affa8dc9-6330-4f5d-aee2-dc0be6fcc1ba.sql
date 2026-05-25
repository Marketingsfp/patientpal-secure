CREATE TABLE IF NOT EXISTS public.cb_convenio_valores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  convenio_id uuid NOT NULL REFERENCES public.cb_convenios(id) ON DELETE CASCADE,
  dependentes integer NOT NULL CHECK (dependentes >= 0),
  valor_mensal numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (convenio_id, dependentes)
);

CREATE INDEX IF NOT EXISTS idx_cb_convenio_valores_convenio ON public.cb_convenio_valores(convenio_id);

ALTER TABLE public.cb_convenio_valores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ver valores convenio"
  ON public.cb_convenio_valores FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.cb_convenios c WHERE c.id = convenio_id AND is_member(auth.uid(), c.clinica_id)));

CREATE POLICY "Gestores podem criar valores convenio"
  ON public.cb_convenio_valores FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.cb_convenios c WHERE c.id = convenio_id AND can_manage_clinica(auth.uid(), c.clinica_id)));

CREATE POLICY "Gestores podem atualizar valores convenio"
  ON public.cb_convenio_valores FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.cb_convenios c WHERE c.id = convenio_id AND can_manage_clinica(auth.uid(), c.clinica_id)));

CREATE POLICY "Gestores podem excluir valores convenio"
  ON public.cb_convenio_valores FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.cb_convenios c WHERE c.id = convenio_id AND can_manage_clinica(auth.uid(), c.clinica_id)));

CREATE TRIGGER trg_cb_convenio_valores_updated BEFORE UPDATE ON public.cb_convenio_valores
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();