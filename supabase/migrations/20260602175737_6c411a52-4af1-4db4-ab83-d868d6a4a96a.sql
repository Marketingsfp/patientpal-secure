UPDATE public.procedimentos SET tipo = 'procedimento' WHERE lower(tipo) = 'cirurgia';
DELETE FROM public.tipos_servico WHERE lower(nome) = 'cirurgia';