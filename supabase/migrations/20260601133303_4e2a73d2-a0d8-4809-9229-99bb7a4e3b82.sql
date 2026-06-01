CREATE TABLE IF NOT EXISTS public._pac_stage_import (
  nome text, cpf text, sexo text, data_nascimento text, email text,
  telefone text, telefone2 text, cep text, logradouro text, numero text,
  complemento text, bairro text, cidade text, estado text, codigo_prontuario text
);
GRANT ALL ON public._pac_stage_import TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public._pac_stage_import TO authenticated;
ALTER TABLE public._pac_stage_import ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stage import service" ON public._pac_stage_import FOR ALL TO service_role USING (true) WITH CHECK (true);