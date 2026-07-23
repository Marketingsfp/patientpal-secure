
WITH olds AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY nome) AS rn
  FROM pacientes
  WHERE clinica_id='7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
    AND codigo_prontuario LIKE 'OLD-%'
)
UPDATE pacientes p
SET codigo_prontuario = (2655856 + o.rn)::text
FROM olds o
WHERE p.id = o.id;
