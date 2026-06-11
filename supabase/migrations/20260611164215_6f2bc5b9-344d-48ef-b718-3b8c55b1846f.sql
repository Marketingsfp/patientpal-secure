UPDATE public.agendamentos
SET procedimento = 'CONSULTA OFTALMO (OFTALMOLOGIA)'
WHERE medico_id = '728baa3b-5725-4f43-aac1-57505ab8d723'
  AND procedimento IN ('CONSULTA OFTALMO', 'CONSULTA', 'OFTALMOLOGIA')
  AND inicio::date >= CURRENT_DATE;