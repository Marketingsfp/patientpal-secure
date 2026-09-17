BEGIN;

DROP POLICY IF EXISTS "confirmacoes: quem ve o agendamento le" ON public.agendamento_confirmacoes;
CREATE POLICY "confirmacoes: quem ve o agendamento le" ON public.agendamento_confirmacoes
  FOR SELECT TO authenticated
  USING (
    clinica_id = ANY (public.clinicas_do_usuario())
    AND EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.id = agendamento_confirmacoes.agendamento_id
        AND a.clinica_id = agendamento_confirmacoes.clinica_id
    )
  );

DROP POLICY IF EXISTS memberships_manager_insert ON public.clinica_memberships;
DROP POLICY IF EXISTS memberships_manager_update ON public.clinica_memberships;
DROP POLICY IF EXISTS memberships_manager_delete ON public.clinica_memberships;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.clinica_memberships FROM anon, authenticated;
REVOKE ALL ON public.clinica_memberships FROM anon;

DROP POLICY IF EXISTS "Admin/gestor gerencia cargos da clínica" ON public.user_roles;
DROP POLICY IF EXISTS "Admin/gestor atualiza cargos da clínica" ON public.user_roles;
DROP POLICY IF EXISTS "Admin/gestor remove cargos da clínica" ON public.user_roles;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_roles FROM anon, authenticated;
REVOKE ALL ON public.user_roles FROM anon;

CREATE OR REPLACE FUNCTION public.is_admin_global(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_platform_admin(_user_id)
$function$;

CREATE OR REPLACE FUNCTION public.is_global_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_platform_admin(_user_id)
$function$;

CREATE OR REPLACE FUNCTION public.criar_clinica_com_admin(_nome text, _cnpj text DEFAULT NULL::text, _telefone text DEFAULT NULL::text, _cidade text DEFAULT NULL::text, _estado text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
  _clinica_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_platform_admin(_user_id) THEN
    RAISE EXCEPTION 'Somente o administrador da plataforma pode criar uma nova unidade';
  END IF;

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
  VALUES (_user_id, _clinica_id, 'admin', true)
  ON CONFLICT DO NOTHING;

  PERFORM public.seed_clinica_padrao(_clinica_id);

  RETURN _clinica_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.criar_clinica_com_admin(text, text, text, text, text) FROM anon, PUBLIC;

COMMIT;