
CREATE OR REPLACE FUNCTION public.agenda_slot_lock(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _nome text;
  _cur_by uuid;
  _cur_nome text;
  _cur_at timestamptz;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT edit_lock_by, edit_lock_by_nome, edit_lock_at
    INTO _cur_by, _cur_nome, _cur_at
  FROM public.agendamentos WHERE id = _id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF _cur_by IS NOT NULL AND _cur_by <> _uid AND _cur_at IS NOT NULL AND _cur_at > (now() - interval '3 minutes') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'locked',
      'by_nome', COALESCE(_cur_nome, 'outro usuário'),
      'at', _cur_at
    );
  END IF;

  SELECT NULLIF(p.nome, '') INTO _nome FROM public.profiles p WHERE p.id = _uid;

  UPDATE public.agendamentos
     SET edit_lock_by = _uid,
         edit_lock_by_nome = COALESCE(_nome, 'usuário'),
         edit_lock_at = now()
   WHERE id = _id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.agenda_slot_lock(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.agenda_slot_unlock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_slot_lock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_slot_unlock(uuid) TO authenticated;
