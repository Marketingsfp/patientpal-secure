
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS codigo_prontuario_anterior text;

DROP TABLE IF EXISTS public._pasta_import_cpf;
CREATE TABLE public._pasta_import_cpf (cpf text PRIMARY KEY, pasta text NOT NULL);
GRANT ALL ON public._pasta_import_cpf TO service_role;
ALTER TABLE public._pasta_import_cpf ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS public._pasta_import_nome;
CREATE TABLE public._pasta_import_nome (nome text PRIMARY KEY, pasta text NOT NULL);
GRANT ALL ON public._pasta_import_nome TO service_role;
ALTER TABLE public._pasta_import_nome ENABLE ROW LEVEL SECURITY;
