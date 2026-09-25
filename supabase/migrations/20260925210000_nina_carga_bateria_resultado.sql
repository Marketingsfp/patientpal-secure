-- Bateria por profissional nos testes de carga (Luna como paciente).
-- Guarda o resultado estruturado de cada passo: mensagem escrita pela Luna,
-- verificação do cenário e devolução da vaga de teste à agenda.
-- Coluna opcional: testes de carga existentes continuam sem usá-la.
ALTER TABLE public.nina_teste_carga_amostras ADD COLUMN IF NOT EXISTS resultado jsonb;
