-- =========================================================================
-- Seed do ambiente de LABORATÓRIO.
--
-- Este arquivo NÃO é executado automaticamente. Rode manualmente no Cloud-Lab
-- (nunca no Cloud-Prod). Ele popula a allowlist de contatos autorizados a
-- receber mensagens reais durante testes no lab e pode ser estendido com
-- pacientes/clínicas fictícios conforme necessário.
--
-- Convenções:
--   - telefones em E.164 sem sinais: "5588999998888"
--   - e-mails em minúsculas
-- =========================================================================

-- Allowlist mínima — ajuste com os contatos da equipe antes de rodar.
INSERT INTO public.lab_allowlist_contatos (tipo, valor, descricao)
VALUES
  ('telefone', '5588999990001', 'Celular teste - QA 1'),
  ('telefone', '5588999990002', 'Celular teste - QA 2'),
  ('email',    'qa+lab@exemplo.com.br', 'E-mail teste - QA')
ON CONFLICT (tipo, valor) DO NOTHING;

-- Espaço para futuros inserts de dados fictícios (pacientes/clínicas espelho).