-- A Nina passa a informar consultas, horários e valores lendo o CADASTRO do sistema (médicos,
-- aba "Horários médicos" e procedimentos), sem a base de conhecimentos.
--
-- A flag liga isso por clínica. Hoje só a Policlínica Menino Jesus informa; São Francisco de
-- Paula e Consulta Hoje continuam encaminhando para a recepção (decisão anterior) e, sem linha
-- de flag, a nova fonte devolve vazio para elas.
INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo, descricao)
SELECT c.id, 'nina_informa_cadastro', true,
       'Nina informa consultas, horários e valores pelo cadastro do sistema (30/09/2026)'
  FROM public.clinicas c
 WHERE c.id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
ON CONFLICT (clinica_id, flag_key) DO UPDATE SET ativo = true, updated_at = now();
