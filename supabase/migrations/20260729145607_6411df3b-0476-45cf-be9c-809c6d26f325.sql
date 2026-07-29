DROP TABLE IF EXISTS public.lgpd_solicitacoes CASCADE;
DROP TABLE IF EXISTS public.lgpd_consentimentos CASCADE;
DROP TABLE IF EXISTS public.integration_secrets CASCADE;
DELETE FROM public.perfil_permissoes WHERE modulo IN ('lgpd', 'integration-secrets');