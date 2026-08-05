
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS edit_lock_by uuid,
  ADD COLUMN IF NOT EXISTS edit_lock_by_nome text,
  ADD COLUMN IF NOT EXISTS edit_lock_at timestamptz;

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
  _status text;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT edit_lock_by, edit_lock_by_nome, edit_lock_at, status::text
    INTO _cur_by, _cur_nome, _cur_at, _status
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

  SELECT COALESCE(NULLIF(p.nome_completo, ''), NULLIF(p.email, ''), 'usuário')
    INTO _nome
  FROM public.profiles p WHERE p.id = _uid;

  UPDATE public.agendamentos
     SET edit_lock_by = _uid,
         edit_lock_by_nome = COALESCE(_nome, 'usuário'),
         edit_lock_at = now()
   WHERE id = _id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_slot_unlock(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  UPDATE public.agendamentos
     SET edit_lock_by = NULL,
         edit_lock_by_nome = NULL,
         edit_lock_at = NULL
   WHERE id = _id AND (edit_lock_by IS NULL OR edit_lock_by = _uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.agenda_slot_lock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_slot_unlock(uuid) TO authenticated;
