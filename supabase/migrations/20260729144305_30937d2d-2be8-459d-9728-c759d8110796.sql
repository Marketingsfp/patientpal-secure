DROP TABLE IF EXISTS public.mkt_envios CASCADE;
DROP TABLE IF EXISTS public.mkt_leads CASCADE;
DROP TABLE IF EXISTS public.mkt_segmentos CASCADE;
DROP TABLE IF EXISTS public.mkt_landing_pages CASCADE;
DROP TABLE IF EXISTS public.campanhas_marketing CASCADE;
DELETE FROM public.perfil_permissoes WHERE modulo IN ('mkt-leads','mkt-envios','mkt-segmentos','mkt-landing','campanhas');