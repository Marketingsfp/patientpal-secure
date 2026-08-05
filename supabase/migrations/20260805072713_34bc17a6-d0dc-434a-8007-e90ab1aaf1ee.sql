DROP POLICY IF EXISTS "Gestores podem editar perfis" ON public.perfis_acesso;
CREATE POLICY "Gestores podem editar perfis" ON public.perfis_acesso
FOR UPDATE TO authenticated
USING (can_manage_clinica(auth.uid(), clinica_id))
WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

DROP POLICY IF EXISTS "Gestores podem editar permissões" ON public.perfil_permissoes;
CREATE POLICY "Gestores podem editar permissões" ON public.perfil_permissoes
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.perfis_acesso p WHERE p.id = perfil_permissoes.perfil_id AND can_manage_clinica(auth.uid(), p.clinica_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.perfis_acesso p WHERE p.id = perfil_permissoes.perfil_id AND can_manage_clinica(auth.uid(), p.clinica_id)));