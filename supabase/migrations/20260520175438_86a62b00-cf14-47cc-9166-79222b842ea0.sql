
-- 1) Enum global de cargos
DO $$ BEGIN
  CREATE TYPE public.app_role_global AS ENUM (
    'admin', 'tesouraria', 'medico', 'enfermagem', 'recepcao', 'marketing', 'rh'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Tabela user_roles (separada — nunca em profiles)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinica_id uuid REFERENCES public.clinicas(id) ON DELETE CASCADE,
  role app_role_global NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, clinica_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_clinica ON public.user_roles(clinica_id);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3) Função has_role_global (SECURITY DEFINER, evita recursão em RLS)
CREATE OR REPLACE FUNCTION public.has_role_global(_user_id uuid, _role app_role_global, _clinica_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (clinica_id IS NULL OR clinica_id = _clinica_id OR _clinica_id IS NULL)
  )
$$;

-- 4) Políticas RLS de user_roles
CREATE POLICY "Usuário vê seus próprios cargos"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admin/gestor da clínica vê cargos dos membros"
  ON public.user_roles FOR SELECT
  USING (clinica_id IS NOT NULL AND public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "Admin/gestor gerencia cargos da clínica"
  ON public.user_roles FOR INSERT
  WITH CHECK (clinica_id IS NOT NULL AND public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "Admin/gestor atualiza cargos da clínica"
  ON public.user_roles FOR UPDATE
  USING (clinica_id IS NOT NULL AND public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "Admin/gestor remove cargos da clínica"
  ON public.user_roles FOR DELETE
  USING (clinica_id IS NOT NULL AND public.can_manage_clinica(auth.uid(), clinica_id));

-- 5) Branding por clínica
ALTER TABLE public.clinicas
  ADD COLUMN IF NOT EXISTS branding jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 6) Helper para registrar ações manualmente em audit_log
CREATE OR REPLACE FUNCTION public.log_action(
  _table_name text,
  _record_id text,
  _action text,
  _clinica_id uuid DEFAULT NULL,
  _dados_antes jsonb DEFAULT NULL,
  _dados_depois jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
BEGIN
  BEGIN
    SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  EXCEPTION WHEN OTHERS THEN _email := NULL; END;

  INSERT INTO public.audit_log
    (user_id, user_email, clinica_id, table_name, record_id, action, dados_antes, dados_depois)
  VALUES
    (auth.uid(), _email, _clinica_id, _table_name, _record_id, _action, _dados_antes, _dados_depois);
END;
$$;
