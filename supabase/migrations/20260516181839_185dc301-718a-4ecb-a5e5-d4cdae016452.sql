
-- =========================================================
-- HARDENING DE SEGURANÇA
-- =========================================================

-- 1) search_path em todas as funções
ALTER FUNCTION public.touch_updated_at() SET search_path = public;

-- 2) Revogar EXECUTE de anônimos e public para funções internas
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_clinica(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- handle_new_user é chamado pelo trigger no schema auth — não precisa estar exposto à API
-- Funções de RLS são avaliadas no contexto do owner via SECURITY DEFINER, sem precisar de EXECUTE para o usuário

-- 3) CLINICAS — fechar criação direta, criar função segura
DROP POLICY IF EXISTS "clinicas_authenticated_insert" ON public.clinicas;

-- Função segura que cria clínica + membership admin em uma transação
CREATE OR REPLACE FUNCTION public.criar_clinica_com_admin(
  _nome text,
  _cnpj text DEFAULT NULL,
  _telefone text DEFAULT NULL,
  _cidade text DEFAULT NULL,
  _estado text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _clinica_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Validações
  IF _nome IS NULL OR length(trim(_nome)) < 2 OR length(_nome) > 200 THEN
    RAISE EXCEPTION 'Nome inválido (2-200 caracteres)';
  END IF;
  IF _cnpj IS NOT NULL AND length(_cnpj) > 20 THEN
    RAISE EXCEPTION 'CNPJ inválido';
  END IF;
  IF _telefone IS NOT NULL AND length(_telefone) > 30 THEN
    RAISE EXCEPTION 'Telefone inválido';
  END IF;
  IF _estado IS NOT NULL AND length(_estado) <> 2 THEN
    RAISE EXCEPTION 'UF deve ter 2 caracteres';
  END IF;

  INSERT INTO public.clinicas (nome, cnpj, telefone, cidade, estado)
  VALUES (trim(_nome), _cnpj, _telefone, _cidade, _estado)
  RETURNING id INTO _clinica_id;

  INSERT INTO public.clinica_memberships (user_id, clinica_id, role, ativo)
  VALUES (_user_id, _clinica_id, 'admin', true);

  RETURN _clinica_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.criar_clinica_com_admin(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_clinica_com_admin(text, text, text, text, text) TO authenticated;

-- 4) ESPECIALIDADES — restringir insert a gestores
DROP POLICY IF EXISTS "especialidades_insert" ON public.especialidades;

CREATE OR REPLACE FUNCTION public.user_is_any_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinica_memberships
    WHERE user_id = _user_id AND ativo = true AND role IN ('admin', 'gestor')
  )
$$;
REVOKE EXECUTE ON FUNCTION public.user_is_any_manager(uuid) FROM PUBLIC, anon;

CREATE POLICY "especialidades_manager_insert" ON public.especialidades
  FOR INSERT TO authenticated
  WITH CHECK (public.user_is_any_manager(auth.uid()));

-- 5) PROFILES — permitir delete da própria conta
CREATE POLICY "profiles_self_delete" ON public.profiles
  FOR DELETE TO authenticated USING (auth.uid() = id);

-- 6) Validações via CHECK em colunas-chave
ALTER TABLE public.clinicas
  ADD CONSTRAINT clinicas_nome_len CHECK (length(nome) BETWEEN 2 AND 200),
  ADD CONSTRAINT clinicas_estado_len CHECK (estado IS NULL OR length(estado) = 2),
  ADD CONSTRAINT clinicas_cnpj_len CHECK (cnpj IS NULL OR length(cnpj) <= 20),
  ADD CONSTRAINT clinicas_telefone_len CHECK (telefone IS NULL OR length(telefone) <= 30);

ALTER TABLE public.medicos
  ADD CONSTRAINT medicos_nome_len CHECK (length(nome) BETWEEN 2 AND 200),
  ADD CONSTRAINT medicos_crm_len CHECK (length(crm) BETWEEN 1 AND 20),
  ADD CONSTRAINT medicos_crm_uf_len CHECK (length(crm_uf) = 2),
  ADD CONSTRAINT medicos_repasse_range CHECK (percentual_repasse_padrao BETWEEN 0 AND 100);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_nome_len CHECK (length(nome) BETWEEN 1 AND 200);

ALTER TABLE public.regras_rateio
  ADD CONSTRAINT rateio_nome_len CHECK (length(nome) BETWEEN 2 AND 200),
  ADD CONSTRAINT rateio_pm_range CHECK (percentual_medico BETWEEN 0 AND 100),
  ADD CONSTRAINT rateio_pc_range CHECK (percentual_clinica BETWEEN 0 AND 100);
