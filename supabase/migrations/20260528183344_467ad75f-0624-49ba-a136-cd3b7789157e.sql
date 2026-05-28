
-- Reatribuir médicos vinculados a "AUDIOMETRIA" para "OTORRINOLARINGOLOGIA"
UPDATE public.medicos
SET especialidade_id = '52e4a68d-7fa0-445e-9c30-ee5a6814ca4d'
WHERE especialidade_id = 'ae906927-50e4-43a2-8596-1d24b974c78e';

-- Remover a especialidade AUDIOMETRIA (era na verdade um serviço)
DELETE FROM public.especialidades
WHERE id = 'ae906927-50e4-43a2-8596-1d24b974c78e';
