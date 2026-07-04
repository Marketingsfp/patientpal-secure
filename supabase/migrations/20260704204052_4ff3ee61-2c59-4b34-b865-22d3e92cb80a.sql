
-- 1) Novas colunas em audit_log (IP e user agent)
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS user_agent text;

-- 2) Coluna atualizado_por em orcamentos
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS atualizado_por uuid REFERENCES auth.users(id);

-- 3) fn_audit_trigger: agora captura IP/UA quando o header PostgREST estiver presente.
-- Mantém 100% de compatibilidade com as outras tabelas (colunas novas são nullable e opcionais).
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_clinica uuid;
  v_record_id text;
  v_before jsonb;
  v_after jsonb;
  v_headers jsonb;
  v_ip inet;
  v_ua text;
BEGIN
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  EXCEPTION WHEN OTHERS THEN v_email := NULL; END;

  -- Captura IP e user agent do header enviado pelo PostgREST (opcional).
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_ua := v_headers->>'user-agent';
    BEGIN
      v_ip := NULLIF(
        split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1),
        ''
      )::inet;
    EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL; v_ua := NULL; v_ip := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    v_before := to_jsonb(OLD);
    v_after := NULL;
    v_record_id := (to_jsonb(OLD)->>'id');
    v_clinica := NULLIF(to_jsonb(OLD)->>'clinica_id','')::uuid;
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_record_id := (to_jsonb(NEW)->>'id');
    v_clinica := NULLIF(to_jsonb(NEW)->>'clinica_id','')::uuid;
  ELSE
    v_before := NULL;
    v_after := to_jsonb(NEW);
    v_record_id := (to_jsonb(NEW)->>'id');
    v_clinica := NULLIF(to_jsonb(NEW)->>'clinica_id','')::uuid;
  END IF;

  INSERT INTO public.audit_log (
    user_id, user_email, clinica_id, table_name, record_id, action,
    dados_antes, dados_depois, ip_address, user_agent
  ) VALUES (
    v_user_id, v_email, v_clinica, TG_TABLE_NAME, v_record_id, TG_OP,
    v_before, v_after, v_ip, v_ua
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 4) Trigger para preencher criado_por / atualizado_por automaticamente
CREATE OR REPLACE FUNCTION public.fn_orcamentos_set_autor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.criado_por IS NULL THEN
      NEW.criado_por := auth.uid();
    END IF;
    NEW.atualizado_por := auth.uid();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.atualizado_por := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orcamentos_set_autor ON public.orcamentos;
CREATE TRIGGER trg_orcamentos_set_autor
BEFORE INSERT OR UPDATE ON public.orcamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_orcamentos_set_autor();

-- 5) Auditoria de itens do orçamento (reusa fn_audit_trigger)
DROP TRIGGER IF EXISTS trg_audit_orcamento_itens ON public.orcamento_itens;
CREATE TRIGGER trg_audit_orcamento_itens
AFTER INSERT OR UPDATE OR DELETE ON public.orcamento_itens
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- 6) Bloqueio de edição/exclusão de orçamento convertido para não-admin/gestor
CREATE OR REPLACE FUNCTION public.fn_orcamentos_bloqueia_convertido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_pode boolean := false;
  v_email text;
  v_headers jsonb;
  v_ip inet;
  v_ua text;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF OLD.status <> 'convertido' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_pode := public.has_role(v_user_id, 'admin') OR public.has_role(v_user_id, 'gestor');

  IF v_pode THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Registra tentativa bloqueada no audit_log
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  EXCEPTION WHEN OTHERS THEN v_email := NULL; END;
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_ua := v_headers->>'user-agent';
    BEGIN
      v_ip := NULLIF(split_part(coalesce(v_headers->>'x-forwarded-for',''), ',', 1), '')::inet;
    EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;
  EXCEPTION WHEN OTHERS THEN v_headers := NULL; END;

  v_before := to_jsonb(OLD);
  v_after := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;

  INSERT INTO public.audit_log (
    user_id, user_email, clinica_id, table_name, record_id, action,
    dados_antes, dados_depois, ip_address, user_agent
  ) VALUES (
    v_user_id, v_email, OLD.clinica_id, 'orcamentos', OLD.id::text, 'blocked_' || TG_OP,
    v_before, v_after, v_ip, v_ua
  );

  RAISE EXCEPTION 'Orçamento convertido só pode ser alterado por Administrador ou Gestor.'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_orcamentos_bloqueia_convertido ON public.orcamentos;
CREATE TRIGGER trg_orcamentos_bloqueia_convertido
BEFORE UPDATE OR DELETE ON public.orcamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_orcamentos_bloqueia_convertido();
