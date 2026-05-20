UPDATE public.medicos m
SET user_id = u.id
FROM auth.users u
WHERE m.user_id IS NULL
  AND m.email IS NOT NULL
  AND lower(u.email) = lower(m.email);