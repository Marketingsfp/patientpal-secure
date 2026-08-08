CREATE TABLE IF NOT EXISTS public.integration_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  chave text NOT NULL,
  valor text NOT NULL,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, chave)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_secrets TO authenticated;
GRANT ALL ON public.integration_secrets TO service_role;

ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY integration_secrets_select_managers ON public.integration_secrets
  FOR SELECT TO authenticated USING (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY integration_secrets_insert_managers ON public.integration_secrets
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY integration_secrets_update_managers ON public.integration_secrets
  FOR UPDATE TO authenticated USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY integration_secrets_delete_managers ON public.integration_secrets
  FOR DELETE TO authenticated USING (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER integration_secrets_touch
  BEFORE UPDATE ON public.integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

NOTIFY pgrst, 'reload schema';