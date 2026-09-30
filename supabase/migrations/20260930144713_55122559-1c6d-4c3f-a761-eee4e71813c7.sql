CREATE OR REPLACE FUNCTION public.atend_claim_conversa(_conversa_id uuid, _clinica_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ok boolean;
  _admin boolean;
BEGIN
  IF NOT public.is_member(_user_id, _clinica_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta clínica';
  END IF;

  _admin := public.atend_usuario_e_admin(_user_id, _clinica_id);
  IF _admin AND auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'Administrador só assume conversa por ação própria';
  END IF;

  UPDATE public.atend_conversas
     SET atribuida_user_id = _user_id,
         owner_type = 'HUMAN',
         ai_enabled = false,
         status = 'active',
         assigned_at = now(),
         updated_at = now()
   WHERE id = _conversa_id
     AND clinica_id = _clinica_id
     AND atribuida_user_id IS NULL
     AND owner_type <> 'HUMAN'
     AND (NOT _admin OR owner_type <> 'AI')
  RETURNING true INTO _ok;

  RETURN COALESCE(_ok, false);
END;
$function$;