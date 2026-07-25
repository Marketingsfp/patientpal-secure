CREATE TABLE IF NOT EXISTS public.lab_allowlist_contatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('telefone', 'email')),
  valor TEXT NOT NULL,
  descricao TEXT,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo, valor)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_allowlist_contatos TO authenticated;
GRANT ALL ON public.lab_allowlist_contatos TO service_role;

ALTER TABLE public.lab_allowlist_contatos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_global_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'::app_role_global
  )
$$;

CREATE POLICY "lab_allowlist_admin_select"
  ON public.lab_allowlist_contatos FOR SELECT TO authenticated
  USING (public.is_global_admin(auth.uid()));

CREATE POLICY "lab_allowlist_admin_insert"
  ON public.lab_allowlist_contatos FOR INSERT TO authenticated
  WITH CHECK (public.is_global_admin(auth.uid()));

CREATE POLICY "lab_allowlist_admin_update"
  ON public.lab_allowlist_contatos FOR UPDATE TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

CREATE POLICY "lab_allowlist_admin_delete"
  ON public.lab_allowlist_contatos FOR DELETE TO authenticated
  USING (public.is_global_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_lab_allowlist_updated_at ON public.lab_allowlist_contatos;
CREATE TRIGGER trg_lab_allowlist_updated_at
  BEFORE UPDATE ON public.lab_allowlist_contatos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_lab_allowlist_tipo_valor
  ON public.lab_allowlist_contatos (tipo, valor);