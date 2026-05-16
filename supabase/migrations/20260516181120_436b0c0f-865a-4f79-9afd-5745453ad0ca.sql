
-- =========================================================
-- FASE 1: FUNDAÇÃO MULTI-CLÍNICA + RATEIO (estilo Clínica Total)
-- =========================================================

-- Enum de funções
CREATE TYPE public.app_role AS ENUM ('admin', 'gestor', 'medico', 'enfermeiro', 'recepcao', 'financeiro');

-- Enum de forma de pagamento (para regras de rateio)
CREATE TYPE public.forma_pagamento AS ENUM ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'convenio', 'cartao_proprio', 'boleto', 'transferencia');

-- ============== CLINICAS ==============
CREATE TABLE public.clinicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnpj text UNIQUE,
  telefone text,
  email text,
  endereco text,
  cidade text,
  estado text,
  cep text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clinicas ENABLE ROW LEVEL SECURITY;

-- ============== PROFILES ==============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  telefone text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============== MEMBERSHIPS (multi-clínica) ==============
CREATE TABLE public.clinica_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, clinica_id, role)
);
ALTER TABLE public.clinica_memberships ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_memberships_user ON public.clinica_memberships(user_id);
CREATE INDEX idx_memberships_clinica ON public.clinica_memberships(clinica_id);

-- ============== FUNÇÕES DE SEGURANÇA ==============
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _clinica_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinica_memberships
    WHERE user_id = _user_id AND clinica_id = _clinica_id AND role = _role AND ativo = true
  )
$$;

CREATE OR REPLACE FUNCTION public.is_member(_user_id uuid, _clinica_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinica_memberships
    WHERE user_id = _user_id AND clinica_id = _clinica_id AND ativo = true
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_clinica(_user_id uuid, _clinica_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinica_memberships
    WHERE user_id = _user_id AND clinica_id = _clinica_id AND ativo = true
      AND role IN ('admin', 'gestor')
  )
$$;

-- ============== ESPECIALIDADES ==============
CREATE TABLE public.especialidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.especialidades ENABLE ROW LEVEL SECURITY;

-- ============== MEDICOS ==============
CREATE TABLE public.medicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  crm text NOT NULL,
  crm_uf text NOT NULL,
  especialidade_id uuid REFERENCES public.especialidades(id),
  telefone text,
  email text,
  percentual_repasse_padrao numeric(5,2) NOT NULL DEFAULT 70.00,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, crm, crm_uf)
);
ALTER TABLE public.medicos ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_medicos_clinica ON public.medicos(clinica_id);

-- ============== REGRAS DE RATEIO (estilo Clínica Total) ==============
CREATE TABLE public.regras_rateio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  medico_id uuid REFERENCES public.medicos(id) ON DELETE CASCADE,
  especialidade_id uuid REFERENCES public.especialidades(id),
  forma_pagamento public.forma_pagamento,
  procedimento text,
  percentual_medico numeric(5,2) NOT NULL,
  percentual_clinica numeric(5,2) NOT NULL,
  prioridade integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (percentual_medico + percentual_clinica <= 100)
);
ALTER TABLE public.regras_rateio ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_rateio_clinica ON public.regras_rateio(clinica_id);
CREATE INDEX idx_rateio_prioridade ON public.regras_rateio(clinica_id, prioridade DESC);

-- ============== TRIGGER updated_at ==============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_clinicas_updated BEFORE UPDATE ON public.clinicas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_medicos_updated BEFORE UPDATE ON public.medicos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_rateio_updated BEFORE UPDATE ON public.regras_rateio FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== TRIGGER cria profile no signup ==============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============== RLS POLICIES ==============

-- profiles
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- clinicas: membros podem ver; admin/gestor podem editar
CREATE POLICY "clinicas_member_select" ON public.clinicas FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), id));
CREATE POLICY "clinicas_authenticated_insert" ON public.clinicas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clinicas_manager_update" ON public.clinicas FOR UPDATE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), id));
CREATE POLICY "clinicas_manager_delete" ON public.clinicas FOR DELETE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), id));

-- memberships: usuário vê os próprios; admin/gestor vê os da clínica
CREATE POLICY "memberships_self_select" ON public.clinica_memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY "memberships_self_insert_first" ON public.clinica_memberships FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY "memberships_manager_update" ON public.clinica_memberships FOR UPDATE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY "memberships_manager_delete" ON public.clinica_memberships FOR DELETE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

-- especialidades: qualquer logado vê; só admin global edita (por enquanto qualquer logado pode criar)
CREATE POLICY "especialidades_select" ON public.especialidades FOR SELECT TO authenticated USING (true);
CREATE POLICY "especialidades_insert" ON public.especialidades FOR INSERT TO authenticated WITH CHECK (true);

-- medicos
CREATE POLICY "medicos_member_select" ON public.medicos FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY "medicos_manager_insert" ON public.medicos FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY "medicos_manager_update" ON public.medicos FOR UPDATE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY "medicos_manager_delete" ON public.medicos FOR DELETE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

-- regras_rateio
CREATE POLICY "rateio_member_select" ON public.regras_rateio FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY "rateio_manager_insert" ON public.regras_rateio FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY "rateio_manager_update" ON public.regras_rateio FOR UPDATE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY "rateio_manager_delete" ON public.regras_rateio FOR DELETE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

-- ============== SEED ESPECIALIDADES COMUNS ==============
INSERT INTO public.especialidades (nome) VALUES
  ('Clínica Médica'), ('Cardiologia'), ('Dermatologia'), ('Pediatria'),
  ('Ginecologia'), ('Ortopedia'), ('Oftalmologia'), ('Otorrinolaringologia'),
  ('Neurologia'), ('Psiquiatria'), ('Endocrinologia'), ('Urologia');
