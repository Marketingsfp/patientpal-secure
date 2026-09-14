-- Bounded, synthetic schema for the isolated PostgreSQL regression harness.
-- Product assignment functions are loaded from actual migrations by the runner.
-- No application credentials, patient records, WhatsApp tables or network hooks.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('sub', auth.uid(), 'role', auth.role())
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('admin', 'gestor', 'medico', 'enfermeiro', 'recepcao', 'financeiro', 'telefonia');
CREATE TABLE public.clinicas (id uuid PRIMARY KEY, nome text NOT NULL DEFAULT 'SQL TEST');
CREATE TABLE public.clinica_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role public.app_role NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  UNIQUE (clinica_id, user_id)
);
CREATE FUNCTION public.is_member(_user_id uuid, _clinica_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM clinica_memberships WHERE user_id = _user_id AND clinica_id = _clinica_id AND ativo)
$$;
CREATE FUNCTION public.can_manage_clinica(_user_id uuid, _clinica_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM clinica_memberships WHERE user_id = _user_id AND clinica_id = _clinica_id AND ativo AND role IN ('admin', 'gestor'))
$$;
CREATE FUNCTION public.atend_usuario_e_admin(_user_id uuid, _clinica_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM clinica_memberships WHERE user_id = _user_id AND clinica_id = _clinica_id AND ativo AND role = 'admin')
$$;
-- Published helper absent from the old migration chain; exact recorded predicate.
CREATE FUNCTION public.atend_tem_perfil_telefonia(_user_id uuid, _clinica_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM clinica_memberships m WHERE m.user_id = _user_id AND m.clinica_id = _clinica_id AND m.ativo = true AND m.role::text = 'telefonia')
$$;
CREATE FUNCTION public.has_module_access(_user_id uuid, _clinica_id uuid, _module text, _action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_member(_user_id, _clinica_id) AND (_module <> 'telefonia' OR atend_tem_perfil_telefonia(_user_id, _clinica_id) OR can_manage_clinica(_user_id, _clinica_id))
$$;

CREATE TABLE public.atend_departamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid NOT NULL REFERENCES clinicas(id),
  nome text NOT NULL DEFAULT 'TEST', ativo boolean NOT NULL DEFAULT true
);
CREATE TABLE public.atend_departamento_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid NOT NULL REFERENCES clinicas(id),
  departamento_id uuid NOT NULL REFERENCES atend_departamentos(id), user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL DEFAULT 'agente', queue_locked boolean NOT NULL DEFAULT false,
  max_simultaneas integer DEFAULT 5, UNIQUE (departamento_id, user_id)
);
CREATE TABLE public.atend_agente_presenca (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid NOT NULL REFERENCES clinicas(id),
  user_id uuid NOT NULL REFERENCES auth.users(id), status text NOT NULL DEFAULT 'OFFLINE',
  aceita_novas boolean NOT NULL DEFAULT true, visto_em timestamptz NOT NULL DEFAULT now(),
  estado_manual text, estado_manual_em timestamptz, estado_manual_por uuid, estado_manual_versao integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (clinica_id, user_id)
);
CREATE TABLE public.atend_pause_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid NOT NULL REFERENCES clinicas(id),
  nome text NOT NULL DEFAULT 'SQL TEST pause', ativo boolean NOT NULL DEFAULT true
);
CREATE TABLE public.atend_pausas_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid NOT NULL REFERENCES clinicas(id),
  user_id uuid NOT NULL REFERENCES auth.users(id), reason_id uuid REFERENCES atend_pause_reasons(id),
  iniciada_em timestamptz NOT NULL DEFAULT now(), finalizada_em timestamptz
);
CREATE TABLE public.atend_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid NOT NULL REFERENCES clinicas(id),
  atribuida_user_id uuid REFERENCES auth.users(id), departamento_id uuid REFERENCES atend_departamentos(id),
  status text NOT NULL DEFAULT 'waiting', owner_type text NOT NULL DEFAULT 'NONE', ai_enabled boolean NOT NULL DEFAULT false,
  is_teste boolean NOT NULL DEFAULT false, handoff_motivo text, handoff_resumo jsonb, handoff_em timestamptz,
  prioridade integer NOT NULL DEFAULT 0, aguardando_desde timestamptz, assigned_at timestamptz,
  atribuicao_origem text, closed_at timestamptz, resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON atend_conversas (clinica_id, atribuida_user_id, status);
CREATE TABLE public.atend_conversa_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid NOT NULL REFERENCES clinicas(id),
  conversa_id uuid NOT NULL REFERENCES atend_conversas(id), evento text NOT NULL, user_id uuid,
  departamento_id uuid, motivo text, detalhes jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON clinicas, clinica_memberships, atend_departamentos, atend_departamento_membros TO authenticated;
GRANT SELECT, INSERT, UPDATE ON atend_agente_presenca, atend_pausas_log, atend_conversas, atend_conversa_eventos TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
ALTER TABLE clinicas ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_member ON clinicas TO authenticated USING (is_member(auth.uid(), id));
ALTER TABLE clinica_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_member ON clinica_memberships TO authenticated USING (is_member(auth.uid(), clinica_id));
ALTER TABLE atend_departamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_member ON atend_departamentos TO authenticated USING (is_member(auth.uid(), clinica_id));
ALTER TABLE atend_departamento_membros ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_member ON atend_departamento_membros TO authenticated USING (is_member(auth.uid(), clinica_id));
ALTER TABLE atend_agente_presenca ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_read ON atend_agente_presenca FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY fixture_insert ON atend_agente_presenca FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND is_member(auth.uid(), clinica_id));
CREATE POLICY fixture_update ON atend_agente_presenca FOR UPDATE TO authenticated USING (user_id = auth.uid() AND is_member(auth.uid(), clinica_id)) WITH CHECK (user_id = auth.uid());
ALTER TABLE atend_pausas_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE atend_pause_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_read ON atend_pause_reasons TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY fixture_self ON atend_pausas_log TO authenticated USING (user_id = auth.uid() OR can_manage_clinica(auth.uid(), clinica_id));
ALTER TABLE atend_conversas ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_member ON atend_conversas TO authenticated USING (is_member(auth.uid(), clinica_id)) WITH CHECK (is_member(auth.uid(), clinica_id));
ALTER TABLE atend_conversa_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_member ON atend_conversa_eventos TO authenticated USING (is_member(auth.uid(), clinica_id)) WITH CHECK (is_member(auth.uid(), clinica_id));
