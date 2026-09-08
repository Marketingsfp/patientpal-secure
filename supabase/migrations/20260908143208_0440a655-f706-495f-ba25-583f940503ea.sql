CREATE OR REPLACE FUNCTION public.atend_conversa_de_handoff(
  _atribuida_user_id uuid,
  _is_teste boolean,
  _handoff_motivo text,
  _handoff_resumo jsonb
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT _atribuida_user_id IS NULL
     AND COALESCE(_is_teste, false) = false
     AND (
       COALESCE(btrim(_handoff_motivo), '') <> ''
       OR (
         _handoff_resumo IS NOT NULL
         AND jsonb_typeof(_handoff_resumo) <> 'null'
         AND COALESCE(btrim(_handoff_resumo::text), '') NOT IN ('', '""', '{}', '[]')
       )
     );
$$;

CREATE OR REPLACE FUNCTION public.atend_distribuir_fila_interno(_clinica_id uuid, _max integer DEFAULT 20)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r record;
  _u uuid;
  _n integer := 0;
  _falhas integer := 0;
BEGIN
  FOR _r IN
    SELECT id, departamento_id
      FROM public.atend_conversas
     WHERE clinica_id = _clinica_id
       AND status IN ('waiting', 'active', 'in_progress')
       AND public.atend_conversa_de_handoff(
             atribuida_user_id, is_teste, handoff_motivo, handoff_resumo
           )
     ORDER BY prioridade DESC, aguardando_desde ASC NULLS LAST, handoff_em ASC NULLS LAST
     LIMIT GREATEST(_max, 1)
  LOOP
    _u := public.atend_auto_assign_conversa(_r.id, _clinica_id, _r.departamento_id, 'queue_distribution');
    IF _u IS NULL THEN
      _falhas := _falhas + 1;
      IF _falhas >= 5 THEN EXIT; END IF;
      CONTINUE;
    END IF;
    _falhas := 0;
    _n := _n + 1;
  END LOOP;

  RETURN _n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.atend_presenca_redistribui()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status <> 'ONLINE' OR NEW.aceita_novas IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'ONLINE'
     AND OLD.aceita_novas IS TRUE THEN
    RETURN NEW;
  END IF;

  IF public.atend_usuario_e_admin(NEW.user_id, NEW.clinica_id)
     OR NOT public.atend_tem_perfil_telefonia(NEW.user_id, NEW.clinica_id) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.atend_conversas c
     WHERE c.clinica_id = NEW.clinica_id
       AND c.status IN ('waiting', 'active', 'in_progress')
       AND public.atend_conversa_de_handoff(
             c.atribuida_user_id, c.is_teste, c.handoff_motivo, c.handoff_resumo
           )
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public.atend_distribuir_fila_interno(NEW.clinica_id, 20);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.atend_conversa_de_handoff(uuid, boolean, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atend_conversa_de_handoff(uuid, boolean, text, jsonb) TO authenticated, service_role;