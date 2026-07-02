# Project Memory

## Core
Sistema clínico multi-clínica (agenda, prontuário, NFS-e, financeiro, cartão convênio). PT-BR em toda UI.
CPF é único por clínica em pacientes (índice parcial idx_pacientes_clinica_cpf_unique — CPFs em branco permitidos).
Validações do cadastro de cliente: nome exige letra + máx 120, data de nascimento entre 1900 e hoje, e-mail regex JS (sem tooltip HTML5).

## Memories
- [Testes pendentes de clientes](mem://tests/clientes-pendentes) — Cenários do formulário /app/clientes que ficaram sem cobertura por timeout do Playwright
