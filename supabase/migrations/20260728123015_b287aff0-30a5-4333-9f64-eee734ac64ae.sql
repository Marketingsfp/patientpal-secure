DELETE FROM public.agendamento_orcamento_itens l
USING public.agendamentos a
WHERE a.id = l.agendamento_id AND a.paciente_id IS NULL;