Objetivo: permitir que, no modelo do contrato do "CARTÃO CONSULTA + SEGUROS", os slots de dependentes 2 a 5 (ou qualquer slot sem dado) deixem de aparecer no PDF impresso, sem precisar manter modelos diferentes por número de dependentes.

Como o motor de template já funciona
- `src/lib/print-contrato.ts` já suporta blocos condicionais `{{#CHAVE}}...{{/CHAVE}}` (renderiza só se a variável tiver valor) e `{{^CHAVE}}...{{/CHAVE}}` (só se estiver vazia).
- Ele já popula `DEPENDENTE_N`, `DEPENDENTE_N_NASCIMENTO`, `DEPENDENTE_N_PARENTESCO`, `DEPENDENTE_N_TELEFONE`, `DEPENDENTE_N_CPF` como string vazia quando o slot não existe.
- Portanto, basta o modelo envolver cada bloco de dependente nos marcadores condicionais — nenhuma alteração na lógica de impressão é necessária.

Mudanças de código (mínimas, só no editor de convênios)
Arquivo: `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx`
1. Em `buildContratoVariaveis(maxDeps)`, para cada `i` de 1 até `maxDeps`, adicionar dois novos itens à lista que alimenta o seletor "Inserir variável":
   - label "Dependente i — início do bloco", token `#DEPENDENTE_i`
   - label "Dependente i — fim do bloco",   token `/DEPENDENTE_i`
   Esses tokens, ao serem inseridos pelo botão, produzem `{{#DEPENDENTE_i}}` e `{{/DEPENDENTE_i}}` no editor.
2. Ajustar o texto de ajuda acima do editor (linhas ~622–628) para mencionar:
   "Para esconder um slot de dependente quando não estiver preenchido, envolva o trecho com `{{#DEPENDENTE_2}}` ... `{{/DEPENDENTE_2}}` (idem para 3, 4 e 5). Use o seletor Inserir variável > Dependente N — início/fim do bloco."

Nenhuma alteração em:
- `src/lib/print-contrato.ts` (já suporta os blocos)
- `src/components/pages/contratos-page.tsx`
- Banco de dados

Como a usuária aplica no modelo já cadastrado
1. Abrir Convênios > CARTÃO CONSULTA + SEGUROS > Modelo do Contrato.
2. Para cada bloco numerado de 2 a 5, na seção "ASSOCIADOS DEPENDENTES":
   a. Posicionar o cursor logo antes do número "2" (ou da linha "Nome: {{DEPENDENTE_2}}").
   b. No menu "Inserir variável", escolher "Dependente 2 — início do bloco" (insere `{{#DEPENDENTE_2}}`).
   c. Posicionar o cursor logo depois de `{{DEPENDENTE_2_TELEFONE}}` (fim da linha de Telefone do mesmo bloco).
   d. Inserir "Dependente 2 — fim do bloco" (`{{/DEPENDENTE_2}}`).
   e. Repetir os mesmos quatro passos para os blocos 3, 4 e 5.
3. Salvar o modelo.

Resultado
- Contrato com 1 dependente: imprime só o bloco 1; blocos 2 a 5 somem.
- Contrato com 3 dependentes: imprime 1, 2 e 3; 4 e 5 somem.
- Contrato com 5 dependentes: imprime todos.
- Modelo continua único; o motor decide o que mostrar a partir dos dados do contrato.

Validação
- `tsgo` no arquivo alterado.
- Teste manual: gerar contrato com 1 dependente preenchido e confirmar que blocos 2–5 não aparecem mais no PDF.