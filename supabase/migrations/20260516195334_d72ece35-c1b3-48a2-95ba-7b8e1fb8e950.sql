CREATE TYPE public.procedimento_tipo AS ENUM ('consulta', 'exame', 'procedimento');

CREATE TABLE public.procedimentos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id uuid NOT NULL,
  nome text NOT NULL,
  tipo public.procedimento_tipo NOT NULL DEFAULT 'consulta',
  codigo text,
  valor_padrao numeric NOT NULL DEFAULT 0,
  duracao_minutos integer NOT NULL DEFAULT 30,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_procedimentos_clinica ON public.procedimentos(clinica_id);

ALTER TABLE public.procedimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "procedimentos_select" ON public.procedimentos
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY "procedimentos_insert" ON public.procedimentos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), clinica_id));

CREATE POLICY "procedimentos_update" ON public.procedimentos
  FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY "procedimentos_delete" ON public.procedimentos
  FOR DELETE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_procedimentos_updated
  BEFORE UPDATE ON public.procedimentos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();