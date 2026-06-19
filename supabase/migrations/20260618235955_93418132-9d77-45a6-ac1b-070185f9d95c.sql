
-- 1) nfse_emitentes: restrict to clinic managers/admins
DROP POLICY IF EXISTS "members manage emitentes" ON public.nfse_emitentes;

CREATE POLICY "managers manage emitentes"
ON public.nfse_emitentes
FOR ALL
TO authenticated
USING (public.can_manage_clinica(auth.uid(), clinica_id))
WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

-- 2) Enable RLS on _mj_match_plan (internal staging; no policies = deny all via Data API)
ALTER TABLE public._mj_match_plan ENABLE ROW LEVEL SECURITY;
