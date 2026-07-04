
CREATE OR REPLACE FUNCTION public.fn_orcamentos_bloqueia_convertido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_pode boolean := false;
  v_email text;
  v_headers jsonb;
  v_ip inet;
  v_ua text;
  v_before jsonb;
  v_after jsonb;
  v_bypass text;
BEGIN
  IF OLD.status <> 'convertido' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Bypass administrativo (scripts de manutenção que setam a GUC)
  BEGIN v_bypass := current_setting('app.orcamento_bypass_block', true); EXCEPTION WHEN OTHERS THEN v_bypass := NULL; END;
  IF v_bypass = '1' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_pode := v_user_id IS NOT NULL AND (
    public.has_role(v_user_id, OLD.clinica_id, 'admin'::app_role)
    OR public.has_role(v_user_id, OLD.clinica_id, 'gestor'::app_role)
  );

  IF v_pode THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  BEGIN SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  EXCEPTION WHEN OTHERS THEN v_email := NULL; END;
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_ua := v_headers->>'user-agent';
    BEGIN v_ip := NULLIF(split_part(coalesce(v_headers->>'x-forwarded-for',''), ',', 1), '')::inet;
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
$function$;
