
DROP TABLE IF EXISTS public._pasta_import_nome2;
CREATE TABLE public._pasta_import_nome2 (nome_norm text PRIMARY KEY, pasta text NOT NULL);
GRANT ALL ON public._pasta_import_nome2 TO service_role;
ALTER TABLE public._pasta_import_nome2 ENABLE ROW LEVEL SECURITY;
