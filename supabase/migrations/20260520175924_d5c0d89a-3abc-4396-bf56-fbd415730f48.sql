
-- =========================================
-- FASE 1 — ADMINISTRAÇÃO
-- =========================================

-- CARGOS
CREATE TABLE IF NOT EXISTS public.cargos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  cbo text,
  salario_base numeric(12,2),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, nome)
);
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cargos_select_member" ON public.cargos FOR SELECT
  USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY "cargos_mutate_manager" ON public.cargos FOR ALL
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_cargos_updated BEFORE UPDATE ON public.cargos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- SETORES
CREATE TABLE IF NOT EXISTS public.setores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  responsavel_id uuid,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, nome)
);
ALTER TABLE public.setores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "setores_select_member" ON public.setores FOR SELECT
  USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY "setores_mutate_manager" ON public.setores FOR ALL
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_setores_updated BEFORE UPDATE ON public.setores
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- UNIDADES
CREATE TABLE IF NOT EXISTS public.unidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  endereco text,
  cidade text,
  estado text,
  cep text,
  telefone text,
  email text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  raio_metros integer DEFAULT 200,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, nome)
);
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unidades_select_member" ON public.unidades FOR SELECT
  USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY "unidades_mutate_manager" ON public.unidades FOR ALL
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_unidades_updated BEFORE UPDATE ON public.unidades
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- PERMISSIONS (catálogo global)
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  modulo text NOT NULL,
  descricao text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permissions_select_auth" ON public.permissions FOR SELECT
  TO authenticated USING (true);

-- ROLE_PERMISSIONS (vínculo cargo -> permissão)
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  cargo_id uuid NOT NULL REFERENCES public.cargos(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cargo_id, permission_id)
);
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_permissions_select_member" ON public.role_permissions FOR SELECT
  USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY "role_permissions_mutate_manager" ON public.role_permissions FOR ALL
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

-- LGPD CONSENTIMENTOS
CREATE TABLE IF NOT EXISTS public.lgpd_consentimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  paciente_id uuid REFERENCES public.pacientes(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  versao text NOT NULL DEFAULT '1.0',
  aceito boolean NOT NULL DEFAULT true,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lgpd_consentimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lgpd_cons_select_own" ON public.lgpd_consentimentos FOR SELECT
  USING (
    user_id = auth.uid()
    OR (clinica_id IS NOT NULL AND public.can_manage_clinica(auth.uid(), clinica_id))
  );
CREATE POLICY "lgpd_cons_insert_own" ON public.lgpd_consentimentos FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR (clinica_id IS NOT NULL AND public.is_member(auth.uid(), clinica_id))
  );

-- LGPD SOLICITACOES
CREATE TABLE IF NOT EXISTS public.lgpd_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paciente_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'pendente',
  resposta text,
  respondido_em timestamptz,
  respondido_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lgpd_solicitacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lgpd_sol_select" ON public.lgpd_solicitacoes FOR SELECT
  USING (
    user_id = auth.uid()
    OR (clinica_id IS NOT NULL AND public.can_manage_clinica(auth.uid(), clinica_id))
  );
CREATE POLICY "lgpd_sol_insert" ON public.lgpd_solicitacoes FOR INSERT
  WITH CHECK (user_id = auth.uid() OR auth.uid() IS NOT NULL);
CREATE POLICY "lgpd_sol_update_manager" ON public.lgpd_solicitacoes FOR UPDATE
  USING (clinica_id IS NOT NULL AND public.can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_lgpd_sol_updated BEFORE UPDATE ON public.lgpd_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- SEED de permissões
INSERT INTO public.permissions (chave, modulo, descricao) VALUES
  ('agenda.view', 'agenda', 'Visualizar agenda'),
  ('agenda.manage', 'agenda', 'Criar e editar agendamentos'),
  ('pacientes.view', 'pacientes', 'Visualizar pacientes'),
  ('pacientes.manage', 'pacientes', 'Criar e editar pacientes'),
  ('prontuarios.view', 'prontuarios', 'Visualizar prontuários'),
  ('prontuarios.manage', 'prontuarios', 'Criar e editar prontuários'),
  ('financeiro.view', 'financeiro', 'Visualizar financeiro'),
  ('financeiro.manage', 'financeiro', 'Gerenciar financeiro'),
  ('estoque.view', 'estoque', 'Visualizar estoque'),
  ('estoque.manage', 'estoque', 'Gerenciar estoque'),
  ('rh.view', 'rh', 'Visualizar RH'),
  ('rh.manage', 'rh', 'Gerenciar RH'),
  ('admin.users', 'admin', 'Gerenciar usuários'),
  ('admin.roles', 'admin', 'Gerenciar cargos e permissões'),
  ('admin.units', 'admin', 'Gerenciar unidades e setores'),
  ('lgpd.manage', 'admin', 'Gerenciar solicitações LGPD')
ON CONFLICT (chave) DO NOTHING;
