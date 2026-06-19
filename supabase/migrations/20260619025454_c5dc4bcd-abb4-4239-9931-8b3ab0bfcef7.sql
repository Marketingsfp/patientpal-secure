
INSERT INTO public.medico_agenda_procedimentos (clinica_id, agenda_id, procedimento_id)
SELECT '7570ddde-8c1c-4b55-ba72-cf12b2a6c940', ma.id, p.id FROM public.medico_agendas ma CROSS JOIN public.procedimentos p
WHERE ma.clinica_id='7570ddde-8c1c-4b55-ba72-cf12b2a6c940' AND ma.nome='TOMOGRAFIA'
  AND p.clinica_id='7570ddde-8c1c-4b55-ba72-cf12b2a6c940' AND p.nome ILIKE '%TOMOG%'
  AND NOT EXISTS (SELECT 1 FROM public.medico_agenda_procedimentos x WHERE x.agenda_id=ma.id AND x.procedimento_id=p.id);

INSERT INTO public.medico_agenda_procedimentos (clinica_id, agenda_id, procedimento_id)
SELECT '7570ddde-8c1c-4b55-ba72-cf12b2a6c940', ma.id, p.id FROM public.medico_agendas ma CROSS JOIN public.procedimentos p
WHERE ma.clinica_id='7570ddde-8c1c-4b55-ba72-cf12b2a6c940' AND ma.nome='RESSONANCIA'
  AND p.clinica_id='7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
  AND (p.nome ILIKE '%RESSON%' OR p.nome ~* '^RM[ _-]')
  AND NOT EXISTS (SELECT 1 FROM public.medico_agenda_procedimentos x WHERE x.agenda_id=ma.id AND x.procedimento_id=p.id);

INSERT INTO public.medico_procedimentos (medico_id, procedimento_id)
SELECT 'faddd827-9523-4311-87c1-7309ae88e13c', p.id FROM public.procedimentos p
WHERE p.clinica_id='7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
  AND (p.nome ILIKE '%TOMOG%' OR p.nome ILIKE '%RESSON%' OR p.nome ~* '^RM[ _-]')
  AND NOT EXISTS (SELECT 1 FROM public.medico_procedimentos x WHERE x.medico_id='faddd827-9523-4311-87c1-7309ae88e13c' AND x.procedimento_id=p.id);
