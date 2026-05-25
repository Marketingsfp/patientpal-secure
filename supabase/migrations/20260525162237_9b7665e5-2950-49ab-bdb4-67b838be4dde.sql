
CREATE TABLE public.tipos_servico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tipos_servico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tipos_servico_select" ON public.tipos_servico
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tipos_servico_manager_insert" ON public.tipos_servico
  FOR INSERT TO authenticated WITH CHECK (user_is_any_manager(auth.uid()));

CREATE POLICY "tipos_servico_manager_update" ON public.tipos_servico
  FOR UPDATE TO authenticated USING (user_is_any_manager(auth.uid()))
  WITH CHECK (user_is_any_manager(auth.uid()));

CREATE POLICY "tipos_servico_manager_delete" ON public.tipos_servico
  FOR DELETE TO authenticated USING (user_is_any_manager(auth.uid()));

CREATE TRIGGER trg_tipos_servico_updated_at
  BEFORE UPDATE ON public.tipos_servico
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.tipos_servico (nome) VALUES
  ('consulta'),
  ('exame'),
  ('procedimento'),
  ('cirurgia')
ON CONFLICT (nome) DO NOTHING;

ALTER TABLE public.procedimentos ALTER COLUMN tipo DROP DEFAULT;
ALTER TABLE public.procedimentos ALTER COLUMN tipo TYPE text USING tipo::text;
ALTER TABLE public.procedimentos ALTER COLUMN tipo SET DEFAULT 'exame';

DROP TYPE IF EXISTS public.procedimento_tipo;
