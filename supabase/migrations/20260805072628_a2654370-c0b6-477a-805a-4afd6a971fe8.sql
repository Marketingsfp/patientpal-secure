-- 1) orcamento_itens: prevent repointing an item to another clinic's budget on update
DROP POLICY IF EXISTS orci_update ON public.orcamento_itens;
CREATE POLICY orci_update ON public.orcamento_itens
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.orcamentos o WHERE o.id = orcamento_itens.orcamento_id AND is_member(auth.uid(), o.clinica_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.orcamentos o WHERE o.id = orcamento_itens.orcamento_id AND is_member(auth.uid(), o.clinica_id)));

-- 2) backup_execucoes: make the read-only, admin-only posture explicit at the grant level
REVOKE INSERT, UPDATE, DELETE ON public.backup_execucoes FROM authenticated, anon;
REVOKE SELECT ON public.backup_execucoes FROM anon;
GRANT SELECT ON public.backup_execucoes TO authenticated;
GRANT ALL ON public.backup_execucoes TO service_role;