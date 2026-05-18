DELETE FROM public.fin_atendimentos;
DELETE FROM public.fin_lancamentos WHERE paciente_id IS NOT NULL OR medico_id IS NOT NULL;
DELETE FROM public.agendamentos;