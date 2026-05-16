-- Insert specialties from spreadsheet
INSERT INTO especialidades (nome) VALUES ('ALERGISTA') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('ANGIOLOGIA') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('ATESTADO/LAUDOS') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('BIOPSIA DR. GUSTAVO') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('BIOPSIA DR. RICARDO FELIPE') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('CARDIOLOGIA') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('COLONOSCOPIA') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('CONSULTA SIMPLES') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('CONSULTAS DIFERENCIADAS') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('DERMATOLOGIA') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('ENDOCRINOLOGIA') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('ENDOSCOPIA') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('FONOAUDIOLOGIA') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('GINECOLOGIA') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('NEUROLOGIA') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('ORTOPEDIA') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('OTORRINOLARINGOLOGIA') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('PEDIATRIA') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('PNEUMOLOGIA') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('PROCTOLOGIA') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('PSIQUIATRIA') ON CONFLICT (nome) DO NOTHING;
INSERT INTO especialidades (nome) VALUES ('UROLOGIA') ON CONFLICT (nome) DO NOTHING;

DELETE FROM medico_especialidades WHERE medico_id IN (SELECT id FROM medicos WHERE clinica_id='a2e1ffd6-084e-4954-84a0-8fe7788274ae');

-- Doctor-specialty mappings
INSERT INTO medico_especialidades (medico_id, especialidade_id)
SELECT m.id, e.id FROM medicos m JOIN especialidades e ON true
WHERE m.clinica_id='a2e1ffd6-084e-4954-84a0-8fe7788274ae' AND (
  (m.nome='DR SANDRO' AND e.nome IN ('ATESTADO/LAUDOS')) OR
  (m.nome='DR. ADRIAN' AND e.nome IN ('UROLOGIA')) OR
  (m.nome='DR. AFONSO' AND e.nome IN ('CARDIOLOGIA')) OR
  (m.nome='DR. ALEXANDRE' AND e.nome IN ('ALERGISTA','CONSULTAS DIFERENCIADAS','ENDOSCOPIA')) OR
  (m.nome='DR. ANDERSON' AND e.nome IN ('CONSULTAS DIFERENCIADAS','NEUROLOGIA')) OR
  (m.nome='DR. ANDRÉ' AND e.nome IN ('ANGIOLOGIA')) OR
  (m.nome='DR. ANTONIO CLARINDO' AND e.nome IN ('CONSULTAS DIFERENCIADAS','PSIQUIATRIA')) OR
  (m.nome='DR. ANTONIO COBUCCI' AND e.nome IN ('CARDIOLOGIA')) OR
  (m.nome='DR. ANTONIO GABRIEL' AND e.nome IN ('CONSULTAS DIFERENCIADAS')) OR
  (m.nome='DR. ARMANDO' AND e.nome IN ('ORTOPEDIA')) OR
  (m.nome='DR. CARLOS EDUARDO' AND e.nome IN ('ATESTADO/LAUDOS','CONSULTAS DIFERENCIADAS','NEUROLOGIA','PSIQUIATRIA')) OR
  (m.nome='DR. CARLOS FEIER' AND e.nome IN ('OTORRINOLARINGOLOGIA')) OR
  (m.nome='DR. CARLOS FELIPE' AND e.nome IN ('UROLOGIA')) OR
  (m.nome='DR. CLAUDIO' AND e.nome IN ('CARDIOLOGIA')) OR
  (m.nome='DR. DANIEL' AND e.nome IN ('CARDIOLOGIA')) OR
  (m.nome='DR. ENEIDA' AND e.nome IN ('OTORRINOLARINGOLOGIA')) OR
  (m.nome='DR. FELIPE CESAR' AND e.nome IN ('CONSULTAS DIFERENCIADAS')) OR
  (m.nome='DR. FELIPE MOURA' AND e.nome IN ('ENDOCRINOLOGIA')) OR
  (m.nome='DR. FRANCISCO' AND e.nome IN ('PEDIATRIA')) OR
  (m.nome='DR. GUSTAVO CARNEVALE' AND e.nome IN ('BIOPSIA DR. GUSTAVO')) OR
  (m.nome='DR. GUSTAVO MAGALHÃES' AND e.nome IN ('CONSULTAS DIFERENCIADAS')) OR
  (m.nome='DR. HUGO' AND e.nome IN ('DERMATOLOGIA')) OR
  (m.nome='DR. IVAN' AND e.nome IN ('ORTOPEDIA')) OR
  (m.nome='DR. JORGE RIBEIRO' AND e.nome IN ('ORTOPEDIA')) OR
  (m.nome='DR. JUNIOR' AND e.nome IN ('GINECOLOGIA')) OR
  (m.nome='DR. LÚCIO' AND e.nome IN ('ATESTADO/LAUDOS','CARDIOLOGIA')) OR
  (m.nome='DR. MAICON' AND e.nome IN ('CARDIOLOGIA')) OR
  (m.nome='DR. MARCOS' AND e.nome IN ('ENDOSCOPIA')) OR
  (m.nome='DR. MAURICIO' AND e.nome IN ('OTORRINOLARINGOLOGIA')) OR
  (m.nome='DR. MILTON' AND e.nome IN ('CARDIOLOGIA')) OR
  (m.nome='DR. OSCAR' AND e.nome IN ('ORTOPEDIA')) OR
  (m.nome='DR. PAULO GUILHERME' AND e.nome IN ('ANGIOLOGIA')) OR
  (m.nome='DR. PAULO ROBERTO' AND e.nome IN ('CARDIOLOGIA')) OR
  (m.nome='DR. RAFAEL' AND e.nome IN ('ORTOPEDIA')) OR
  (m.nome='DR. RICARDO FELIPE' AND e.nome IN ('BIOPSIA DR. RICARDO FELIPE','DERMATOLOGIA')) OR
  (m.nome='DR. ROSANGELA' AND e.nome IN ('PEDIATRIA')) OR
  (m.nome='DR. SERGIO NADER' AND e.nome IN ('PROCTOLOGIA')) OR
  (m.nome='DR. SERGIO PALERMO' AND e.nome IN ('CARDIOLOGIA','CONSULTAS DIFERENCIADAS')) OR
  (m.nome='DR. TARCISIO' AND e.nome IN ('ORTOPEDIA')) OR
  (m.nome='DRA. ADRIANA' AND e.nome IN ('GINECOLOGIA')) OR
  (m.nome='DRA. ADRIANA FERNANDEZ' AND e.nome IN ('DERMATOLOGIA')) OR
  (m.nome='DRA. ALESSANDRA' AND e.nome IN ('GINECOLOGIA')) OR
  (m.nome='DRA. ANDREA DE LUCCA' AND e.nome IN ('DERMATOLOGIA')) OR
  (m.nome='DRA. ANDREA PASSOS' AND e.nome IN ('DERMATOLOGIA')) OR
  (m.nome='DRA. ANDRESSA' AND e.nome IN ('PEDIATRIA')) OR
  (m.nome='DRA. BENITES' AND e.nome IN ('GINECOLOGIA')) OR
  (m.nome='DRA. BRUNA' AND e.nome IN ('DERMATOLOGIA')) OR
  (m.nome='DRA. CAMILA' AND e.nome IN ('GINECOLOGIA')) OR
  (m.nome='DRA. CAROLINA' AND e.nome IN ('PEDIATRIA')) OR
  (m.nome='DRA. CATARINA' AND e.nome IN ('PEDIATRIA')) OR
  (m.nome='DRA. CLAUDIA' AND e.nome IN ('GINECOLOGIA')) OR
  (m.nome='DRA. CLAUDIA MADUREIRA' AND e.nome IN ('FONOAUDIOLOGIA')) OR
  (m.nome='DRA. CONCEIÇÃO' AND e.nome IN ('PEDIATRIA')) OR
  (m.nome='DRA. DAYANE' AND e.nome IN ('GINECOLOGIA')) OR
  (m.nome='DRA. DENISE' AND e.nome IN ('GINECOLOGIA')) OR
  (m.nome='DRA. ELAIR' AND e.nome IN ('PEDIATRIA')) OR
  (m.nome='DRA. ENEIDA' AND e.nome IN ('OTORRINOLARINGOLOGIA')) OR
  (m.nome='DRA. FABIANA' AND e.nome IN ('PEDIATRIA')) OR
  (m.nome='DRA. FLAVIA VIEIRA' AND e.nome IN ('DERMATOLOGIA')) OR
  (m.nome='DRA. IARMILA' AND e.nome IN ('PNEUMOLOGIA')) OR
  (m.nome='DRA. KARINA' AND e.nome IN ('DERMATOLOGIA')) OR
  (m.nome='DRA. KATIA' AND e.nome IN ('GINECOLOGIA')) OR
  (m.nome='DRA. KETLEN' AND e.nome IN ('GINECOLOGIA')) OR
  (m.nome='DRA. MARCIA' AND e.nome IN ('GINECOLOGIA')) OR
  (m.nome='DRA. MARGARETE' AND e.nome IN ('PEDIATRIA')) OR
  (m.nome='DRA. MARIA CONSUELO' AND e.nome IN ('PEDIATRIA')) OR
  (m.nome='DRA. MARIA DAS GRAÇAS' AND e.nome IN ('GINECOLOGIA')) OR
  (m.nome='DRA. MARIANA' AND e.nome IN ('GINECOLOGIA')) OR
  (m.nome='DRA. MONICA' AND e.nome IN ('PEDIATRIA')) OR
  (m.nome='DRA. PATRICIA' AND e.nome IN ('GINECOLOGIA')) OR
  (m.nome='DRA. POLIANA' AND e.nome IN ('PEDIATRIA')) OR
  (m.nome='DRA. RAISSA' AND e.nome IN ('PEDIATRIA')) OR
  (m.nome='DRA. ROSANGELA' AND e.nome IN ('PEDIATRIA')) OR
  (m.nome='DRA. THALITA' AND e.nome IN ('PEDIATRIA')) OR
  (m.nome='DRA. VALÉRIA' AND e.nome IN ('GINECOLOGIA')) OR
  (m.nome='DRA. YASMIN' AND e.nome IN ('GINECOLOGIA'))
);