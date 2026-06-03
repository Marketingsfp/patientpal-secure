DELETE FROM public.audit_log WHERE created_at < now() - interval '180 days';
DROP TABLE IF EXISTS public.import_agenda_legado CASCADE;
DROP TABLE IF EXISTS public.agendamentos_legacy_import CASCADE;
DROP TABLE IF EXISTS public._pac_stage_import CASCADE;