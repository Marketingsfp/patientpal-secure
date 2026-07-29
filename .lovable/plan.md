## Objetivo

No diálogo "Atendimento externo", ninguém precisa digitar o valor. O sistema assume o **valor do serviço na tabela desta clínica** (a que está atendendo/recebendo a GR) e usa esse valor como base do repasse do médico.

## O que muda

**1. Diálogo (`src/components/agenda/atendimento-externo-dialog.tsx`)**
- Ao abrir, busca em `procedimentos` (da clínica atual) o serviço do agendamento e preenche o valor automaticamente (`valor_dinheiro` → `valor_dinheiro_pix` → `valor_padrao`, mesma ordem já usada na agenda).
- O campo deixa de ser obrigatório e passa a mostrar o valor sugerido, com texto do tipo "Valor da tabela desta clínica — ajuste apenas se for diferente".
- Se o serviço não estiver na tabela, o campo fica vazio e é permitido salvar; nesse caso o valor entra como 0 e o repasse fica pendente de ajuste.

**2. Regra de negócio (`src/lib/agenda/atendimento-externo.functions.ts`)**
- Remove a exigência de `origem_valor > 0`.
- Quando o valor não vier do formulário, o servidor busca o preço do procedimento na tabela da clínica que atendeu e usa esse valor (fonte da verdade, mesmo se o front falhar).
- `valor_total` = valor apurado; `valor_medico` = valor apurado; `valor_clinica` = 0; nada em caixa e nenhuma NFS-e, como hoje.

**3. Wizard V2**
- Mesmo comportamento no fluxo de novo agendamento (`novo-agendamento-wizard.tsx`): campo opcional, preenchido sozinho.

## Detalhes técnicos

- Sem migração: `agendamentos.origem_valor` continua guardando o valor apurado.
- Busca de preço por nome do procedimento + `clinica_id`, reaproveitando o helper `primeiroValorValido` já existente na agenda.
- O relatório de atendimentos externos continua exibindo "Valor origem" — agora preenchido automaticamente.
