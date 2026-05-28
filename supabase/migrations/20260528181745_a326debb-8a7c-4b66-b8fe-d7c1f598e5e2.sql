CREATE POLICY "especialidades_manager_update"
ON public.especialidades
FOR UPDATE
USING (public.user_is_any_manager(auth.uid()))
WITH CHECK (public.user_is_any_manager(auth.uid()));

CREATE POLICY "especialidades_manager_delete"
ON public.especialidades
FOR DELETE
USING (public.user_is_any_manager(auth.uid()));