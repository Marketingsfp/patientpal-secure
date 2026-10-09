CREATE TABLE public.nina_jev_limites (
  clinica_id uuid PRIMARY KEY REFERENCES public.clinicas(id) ON DELETE CASCADE,
  urgencia numeric CHECK (urgencia BETWEEN 0.3 AND 0.95),
  pedido_atendente numeric CHECK (pedido_atendente BETWEEN 0.3 AND 0.95),
  irritacao numeric CHECK (irritacao BETWEEN 0.3 AND 0.95),
  conferencia numeric CHECK (conferencia BETWEEN 0.3 AND 0.95),
  escolha numeric CHECK (escolha BETWEEN 0.3 AND 0.95),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.nina_jev_limites TO authenticated;
GRANT ALL ON public.nina_jev_limites TO service_role;
ALTER TABLE public.nina_jev_limites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros leem limites Jev"
  ON public.nina_jev_limites FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()));
CREATE POLICY "Admins inserem limites Jev"
  ON public.nina_jev_limites FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), clinica_id, 'admin'));
CREATE POLICY "Admins alteram limites Jev"
  ON public.nina_jev_limites FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), clinica_id, 'admin'))
  WITH CHECK (public.has_role(auth.uid(), clinica_id, 'admin'));