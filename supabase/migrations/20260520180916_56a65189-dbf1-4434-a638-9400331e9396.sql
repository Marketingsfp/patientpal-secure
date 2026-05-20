-- Allow managers to view profiles of users in clinics they manage
CREATE POLICY "profiles_manager_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinica_memberships m
      WHERE m.user_id = profiles.id
        AND can_manage_clinica(auth.uid(), m.clinica_id)
    )
  );

-- Allow members of the same clinic to view each other's basic profile
CREATE POLICY "profiles_peer_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinica_memberships m
      WHERE m.user_id = profiles.id
        AND is_member(auth.uid(), m.clinica_id)
    )
  );