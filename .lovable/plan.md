## Objetivo

Na aba **Benefícios** do editor de convênio, exibir — **apenas quando o convênio for FUNCIONARIO** — um bloco chamado **"Exceções"** para listar procedimentos que **não recebem nenhum desconto** desse convênio.

## Clínica-alvo

A funcionalidade é ligada exclusivamente ao convênio "FUNCIONARIO" e o mesmo convênio existe nas 3 clínicas com a mesma finalidade, então proponho aplicar **globalmente**. Confirme se prefere restringir a uma única clínica.

## Como vai funcionar (regra de negócio)

Uma "exceção" é um procedimento específico que, dentro do convênio FUNCIONARIO, é cobrado como **particular** (sem desconto), mesmo que exista uma regra genérica por especialidade/categoria que daria desconto.

Vamos aproveitar o motor de descontos existente (`src/lib/cb-regras.ts`), que já dá prioridade máxima a regras com `procedimento_id` definido. Cada exceção é gravada como uma linha em `cb_convenio_regras` com:

- `procedimento_id` = procedimento escolhido
- `modo` = `"percentual_desconto"`, `percentual` = `0`
- `prioridade` = `999` (ganha de qualquer regra por categoria)
- `especialidade_id` = null, `tipo` = null, `gratuito` = false, `ativo` = true

Como `findRegra` já pontua serviço específico com score 100, a exceção vence sobre qualquer regra por especialidade/categoria e `computeValor` com 0% retorna o valor particular integral. Sem mudanças no engine nem no banco.

## Escopo da mudança (apenas front-end)

Arquivo: `src/components/cartao-beneficios/regras-tab.tsx`

1. Receber (ou reusar) o helper `isConvenioFuncionario(convenioNome)` — importado ou inline — para gate do bloco.
2. Renderizar, acima da tabela principal, um card **"Exceções (sem desconto)"** somente para FUNCIONARIO com:
   - `SearchableSelect` de procedimento (mesma lista já carregada em `procedimentos`).
   - Botão **Adicionar** → grava a regra conforme especificado acima e faz `load()`.
   - Lista das exceções atuais (regras com `procedimento_id != null` e `percentual === 0` e `modo === 'percentual_desconto'`), cada uma com um botão de remover (delete direto na `cb_convenio_regras`).
3. Feedback via `toast`; erros via `mostrarErro`.
4. As mesmas linhas continuam aparecendo na tabela principal (fonte única de verdade). Opcional: marcar visualmente com um badge "Exceção" na coluna Serviço quando `percentual === 0` — decido incluir esse badge sutil para facilitar identificação.

## Validação

- No convênio FUNCIONARIO: bloco "Exceções" aparece; adicionar um procedimento cria a regra e ele passa a ser cobrado sem desconto no fluxo de agendamento.
- Simular um agendamento desse procedimento para paciente do FUNCIONARIO e conferir que o preço é o particular integral.
- Em qualquer outro convênio: bloco **não** aparece.
- Remover a exceção volta a aplicar a regra por categoria/especialidade original.

## Pendências / riscos

- Nenhum impacto em outros convênios ou em regras já existentes — as exceções são apenas linhas adicionais em `cb_convenio_regras`.
- Se o usuário adicionar como exceção um procedimento que já tenha uma regra específica por `procedimento_id` cadastrada manualmente, a mais nova (0%) prevalece por prioridade 999. Fica registrado nesta plan.