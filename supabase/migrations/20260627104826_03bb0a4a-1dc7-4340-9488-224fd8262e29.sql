UPDATE public.clinica_memberships
SET role = 'admin', ativo = true
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'jpnevespsfp@gmail.com');