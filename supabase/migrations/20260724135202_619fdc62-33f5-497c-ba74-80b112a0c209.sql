-- Restaura GRANT SELECT na view pública de emitentes NFS-e para authenticated.
-- A view filtra por clinica_memberships e não expõe certificado/senha.
GRANT SELECT ON public.nfse_emitentes_publico TO authenticated;
GRANT ALL ON public.nfse_emitentes_publico TO service_role;

-- Restaura acesso à tabela base para managers (RLS já restringe a managers da clínica).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfse_emitentes TO authenticated;
GRANT ALL ON public.nfse_emitentes TO service_role;