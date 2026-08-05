CREATE OR REPLACE FUNCTION public.enforce_sem_carencia_permission()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_changed boolean := false;
begin
  if TG_OP = 'INSERT' then
    v_changed := coalesce(NEW.sem_carencia, false) = true;
  else
    v_changed := coalesce(NEW.sem_carencia, false) IS DISTINCT FROM coalesce(OLD.sem_carencia, false)
              OR coalesce(NEW.sem_carencia_motivo, '') IS DISTINCT FROM coalesce(OLD.sem_carencia_motivo, '');
  end if;

  if not v_changed then
    return NEW;
  end if;

  if coalesce(NEW.sem_carencia, false) = true then
    -- Motivo continua obrigatório (rastreabilidade).
    if coalesce(btrim(NEW.sem_carencia_motivo), '') = '' then
      raise exception 'Motivo é obrigatório para isentar carência do contrato.'
        using errcode = '23514';
    end if;

    -- Regra atualizada: qualquer usuário autenticado (inclusive caixa/recepção)
    -- pode marcar a isenção; a autoria fica registrada para auditoria.
    if auth.uid() is null then
      raise exception 'É preciso estar autenticado para isentar a carência.'
        using errcode = '42501';
    end if;

    NEW.sem_carencia_por := coalesce(NEW.sem_carencia_por, auth.uid());
    NEW.sem_carencia_em  := coalesce(NEW.sem_carencia_em, now());
  end if;

  return NEW;
end;
$function$;