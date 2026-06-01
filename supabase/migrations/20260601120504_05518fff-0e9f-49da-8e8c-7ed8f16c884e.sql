-- Normalize especialidades to Title Case so they match procedimentos.grupo display
UPDATE especialidades SET nome = 'Endoscopia' WHERE id = 'b1dc677e-b0e4-49d6-b58a-4a723087c831';
UPDATE especialidades SET nome = 'Ginecologia' WHERE id = '849062bc-8e12-4b40-8bd6-da9fc93ade34';
UPDATE especialidades SET nome = 'Neurologia' WHERE id = '01ee9991-37b3-4c09-bd1d-00924b0bfe77';
UPDATE especialidades SET nome = 'Odontologia' WHERE id = 'f0cfaa0a-2a67-4176-97de-a7072c37077c';
UPDATE especialidades SET nome = 'Ortopedia' WHERE id = '272b02a4-dc8e-4055-b4c7-aa2be1c04f0c';
UPDATE especialidades SET nome = 'Otorrinolaringologia' WHERE id = '52e4a68d-7fa0-445e-9c30-ee5a6814ca4d';
UPDATE especialidades SET nome = 'Pediatria' WHERE id = 'b87409cc-1a23-47fb-bd68-22e20d1aa6a1';
UPDATE especialidades SET nome = 'Proctologia' WHERE id = 'd49be094-40e3-4b5e-8ab6-4c1581b8e990';
UPDATE especialidades SET nome = 'Ultrassonografia' WHERE id = '58c7e22c-6261-47f7-b19c-a48564d75ba8';
UPDATE especialidades SET nome = 'Urologia' WHERE id = '50000dbc-cd47-471a-8f5d-4f598975a183';

-- Align procedimentos.grupo casing exactly with especialidades for this clinic
UPDATE procedimentos p
SET grupo = e.nome, updated_at = now()
FROM especialidades e
WHERE p.clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
  AND p.grupo IS NOT NULL
  AND lower(trim(p.grupo)) = lower(trim(e.nome))
  AND p.grupo <> e.nome;