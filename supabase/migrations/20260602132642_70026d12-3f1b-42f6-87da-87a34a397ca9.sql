
-- Vars
DO $$
DECLARE
  _clinica uuid := '7570ddde-8c1c-4b55-ba72-cf12b2a6c940';
  _cc uuid := '36af070b-dad7-4013-b3e7-3ff343535c4f'; -- CARTÃO CONSULTA
  _ct uuid := '5a4032a7-2489-4ccc-8eb2-041b6ecbf87d'; -- CARTÃO TERAPÊUTICO
  _esp_cc8 uuid[] := ARRAY[
    '9615f760-fb79-4382-8676-1a3b59553375', -- ANGIOLOGIA
    '6018fac3-1910-4f39-ac73-1b4ac470f9c3', -- CARDIOLOGIA
    'e42eb61e-4505-470e-b3ee-d34ec90a8a13', -- CLINICO GERAL
    'd5226e19-e830-4b12-8b89-01b81699f2ac', -- DERMATOLOGIA
    '0701b7f9-d845-4a4c-8d3a-479d38a60062', -- ENDOCRINOLOGIA
    '852e7bdc-5067-4f1e-b8b7-c0422af88cd6', -- GASTRO
    '5e4b549e-c0c8-4567-a1d7-5eb051a9954d', -- GERIATRIA
    '849062bc-8e12-4b40-8bd6-da9fc93ade34', -- GINECOLOGIA
    '272b02a4-dc8e-4055-b4c7-aa2be1c04f0c', -- ORTOPEDIA
    '52e4a68d-7fa0-445e-9c30-ee5a6814ca4d', -- OTORRINO
    '28c024e8-460f-45ee-9c2e-1df2ea1ca6a1', -- OBSTETRICIA
    'b87409cc-1a23-47fb-bd68-22e20d1aa6a1', -- PEDIATRIA
    '50000dbc-cd47-471a-8f5d-4f598975a183'  -- UROLOGIA
  ]::uuid[];
  _esp_cc60 uuid[] := ARRAY[
    '6bb1da7f-a1e9-401e-8228-d235d011395a', -- PSICOLOGIA
    '050eeab5-0f72-4484-a0c7-0d5be4531f8c'  -- NUTRICAO
  ]::uuid[];
  _esp_cc80 uuid[] := ARRAY[
    '6ad1adf0-4f2e-4c2a-b896-37b488676124', -- ALERGOLOGIA
    'e65b426d-b4e5-4ae8-b0e4-1a1b1a09559e', -- FONOAUDIOLOGIA
    'de2c2b93-b589-440c-bcd0-1f832e8dc0e5', -- MASTOLOGIA
    '593df6bb-a086-4a79-ad69-f1b76f624072', -- NEFROLOGIA
    '01ee9991-37b3-4c09-bd1d-00924b0bfe77', -- NEUROLOGIA
    '670e1182-22b2-4dea-a101-d47020b1f1ca', -- OFTALMOLOGIA
    '295c105e-4f6f-465d-a67c-44265085ac16', -- PNEUMOLOGIA
    'd49be094-40e3-4b5e-8ab6-4c1581b8e990', -- PROCTOLOGIA
    '43b98fdd-68cf-486a-87b0-67e7fe7d9440', -- PSIQUIATRIA
    'fa5c8d28-0171-4533-aeb2-dc96fea7dfa7'  -- REUMATOLOGIA
  ]::uuid[];
  _esp_cc10p uuid[] := ARRAY[
    'e737ff20-9409-4fff-911f-b9dd68cb46cd', -- LABORATORIO
    '9f0ed5be-df9e-4654-b41d-64f1cbc8a36c', -- ELETROCARDIOGRAMA
    '5ca84a61-9912-44aa-bf6d-9dbfaa36463e', -- RAIO-X
    '64b023cd-e058-4fbb-83ab-3e2a3f54fb63', -- MAMOGRAFIA
    '32fa3ee6-1e4a-4e00-bbe6-3c20333f5cf4'  -- DENSITOMETRIA OSSEA
  ]::uuid[];
  _esp_cc5p uuid[] := ARRAY[
    'f0cfaa0a-2a67-4176-97de-a7072c37077c', -- ODONTOLOGIA
    '58c7e22c-6261-47f7-b19c-a48564d75ba8', -- USG
    '88fe4840-e2b5-4375-aa40-52ed7716db2e', -- TC
    'c19f9315-4d05-41bf-8c4c-83ec95a4a4e6', -- RM
    '7f9cf211-1309-421b-9479-10577f451267', -- EEG
    '8783496f-bcda-47e0-adab-d78ed2ab1fc8', -- ERGOMETRICO
    'b1dc677e-b0e4-49d6-b58a-4a723087c831', -- ENDOSCOPIA
    '9e802471-65f6-41a8-b09f-c68988810a85'  -- FISIOTERAPIA
  ]::uuid[];
  _esp_ct40 uuid[] := ARRAY[
    'b87409cc-1a23-47fb-bd68-22e20d1aa6a1', -- PEDIATRIA
    '01ee9991-37b3-4c09-bd1d-00924b0bfe77', -- NEUROLOGIA
    '272b02a4-dc8e-4055-b4c7-aa2be1c04f0c', -- ORTOPEDIA
    '050eeab5-0f72-4484-a0c7-0d5be4531f8c'  -- NUTRICAO
  ]::uuid[];
  _id uuid;
BEGIN
  -- CARTÃO CONSULTA: limpa regras existentes deste convênio
  DELETE FROM cb_convenio_regras WHERE convenio_id = _cc;
  DELETE FROM cb_convenio_regras WHERE convenio_id = _ct;

  -- CC: R$ 8,00 fixo
  FOREACH _id IN ARRAY _esp_cc8 LOOP
    INSERT INTO cb_convenio_regras (clinica_id, convenio_id, especialidade_id, tipo, modo, valor, prioridade)
    VALUES (_clinica, _cc, _id, 'consulta', 'valor_fixo', 8.00, 10);
  END LOOP;
  -- CC: R$ 60,00
  FOREACH _id IN ARRAY _esp_cc60 LOOP
    INSERT INTO cb_convenio_regras (clinica_id, convenio_id, especialidade_id, tipo, modo, valor, prioridade)
    VALUES (_clinica, _cc, _id, 'consulta', 'valor_fixo', 60.00, 10);
  END LOOP;
  -- CC: R$ 80,00
  FOREACH _id IN ARRAY _esp_cc80 LOOP
    INSERT INTO cb_convenio_regras (clinica_id, convenio_id, especialidade_id, tipo, modo, valor, prioridade)
    VALUES (_clinica, _cc, _id, 'consulta', 'valor_fixo', 80.00, 10);
  END LOOP;
  -- CC: 10% exames
  FOREACH _id IN ARRAY _esp_cc10p LOOP
    INSERT INTO cb_convenio_regras (clinica_id, convenio_id, especialidade_id, tipo, modo, percentual, prioridade)
    VALUES (_clinica, _cc, _id, 'exame', 'percentual_desconto', 10.00, 10);
  END LOOP;
  -- CC: 5% exames
  FOREACH _id IN ARRAY _esp_cc5p LOOP
    INSERT INTO cb_convenio_regras (clinica_id, convenio_id, especialidade_id, tipo, modo, percentual, prioridade)
    VALUES (_clinica, _cc, _id, 'exame', 'percentual_desconto', 5.00, 10);
  END LOOP;

  -- CARTÃO TERAPÊUTICO: 40% consultas específicas
  FOREACH _id IN ARRAY _esp_ct40 LOOP
    INSERT INTO cb_convenio_regras (clinica_id, convenio_id, especialidade_id, tipo, modo, percentual, prioridade)
    VALUES (_clinica, _ct, _id, 'consulta', 'percentual_desconto', 40.00, 10);
  END LOOP;
  -- CT: 10% exames (regra genérica)
  INSERT INTO cb_convenio_regras (clinica_id, convenio_id, especialidade_id, tipo, modo, percentual, prioridade)
  VALUES (_clinica, _ct, NULL, 'exame', 'percentual_desconto', 10.00, 5);
END $$;

-- Bulk apply: para cada serviço, encontra a regra e faz upsert em procedimento_cb_convenio_valores
WITH svc AS (
  SELECT
    p.id AS proc_id,
    p.clinica_id,
    p.tipo,
    p.valor_dinheiro,
    p.valor_pix,
    -- especialidade via grupo (texto, normalizado)
    (SELECT e.id FROM especialidades e
      WHERE upper(strip_accents(e.nome)) = upper(strip_accents(p.grupo))
      LIMIT 1) AS esp_id
  FROM procedimentos p
  WHERE p.clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
),
matched AS (
  SELECT s.proc_id, s.clinica_id, r.convenio_id, r.modo, r.valor, r.percentual,
         s.valor_dinheiro, s.valor_pix,
         ROW_NUMBER() OVER (PARTITION BY s.proc_id, r.convenio_id ORDER BY r.prioridade DESC) AS rn
  FROM svc s
  JOIN cb_convenio_regras r
    ON r.convenio_id IN ('36af070b-dad7-4013-b3e7-3ff343535c4f','5a4032a7-2489-4ccc-8eb2-041b6ecbf87d')
   AND r.ativo
   AND (r.especialidade_id IS NULL OR r.especialidade_id = s.esp_id)
   AND (r.tipo IS NULL OR r.tipo = s.tipo)
)
INSERT INTO procedimento_cb_convenio_valores (clinica_id, procedimento_id, convenio_id, valor_dinheiro, valor_outros)
SELECT
  clinica_id, proc_id, convenio_id,
  CASE WHEN modo='valor_fixo' THEN valor
       ELSE ROUND(COALESCE(valor_dinheiro,0) * (1 - percentual/100.0), 2) END,
  CASE WHEN modo='valor_fixo' THEN valor
       ELSE ROUND(COALESCE(valor_pix,0) * (1 - percentual/100.0), 2) END
FROM matched WHERE rn = 1
ON CONFLICT (procedimento_id, convenio_id) DO UPDATE
  SET valor_dinheiro = EXCLUDED.valor_dinheiro,
      valor_outros   = EXCLUDED.valor_outros,
      updated_at     = now();
