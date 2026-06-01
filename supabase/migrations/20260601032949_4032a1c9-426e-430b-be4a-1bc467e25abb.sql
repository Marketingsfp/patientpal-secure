CREATE TABLE public.sistema_planos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_plano INTEGER NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  data TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sistema_planos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sistema_planos TO authenticated;
GRANT ALL ON public.sistema_planos TO service_role;

ALTER TABLE public.sistema_planos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Planos visíveis para todos autenticados"
  ON public.sistema_planos FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Apenas admins globais gerenciam planos"
  ON public.sistema_planos FOR ALL
  TO authenticated
  USING (public.has_role_global(auth.uid(), 'admin'::app_role_global))
  WITH CHECK (public.has_role_global(auth.uid(), 'admin'::app_role_global));

INSERT INTO public.sistema_planos (codigo_plano, descricao, ativo, data) VALUES
  (1, 'BASICO', true, '2025-10-14 14:50:07.313+00'),
  (3, 'COMPLETO', true, '2025-10-14 14:50:07.313+00'),
  (5, 'FRANQUEADORA', true, '2025-10-14 14:50:07.313+00');
