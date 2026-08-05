DROP POLICY IF EXISTS "members select emitentes" ON public.nfse_emitentes;

ALTER FUNCTION public.__actor_set_trocar_convenio() SET search_path = public;