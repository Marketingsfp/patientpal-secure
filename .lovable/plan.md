## Problema
No convênio **FUNCIONARIO** da POLICLINICA MENINO JESUS, as 6 exceções cadastradas apareceram também dentro da tabela "Regras de preço automáticas" (com 0% / prio 999). Elas deveriam ficar visíveis apenas no bloco "Exceções (sem desconto)".

## Causa
Em `src/components/cartao-beneficios/regras-tab.tsx`, as exceções são gravadas na mesma tabela `cb_convenio_regras` (por design — o motor de preço precisa dessas linhas). O bloco de exceções filtra corretamente essas linhas para exibir separadas, mas o `regrasFiltradas` (linhas 224‑265) não as remove — por isso elas aparecem duplicadas na tabela geral.

## Clínica-alvo
Correção puramente técnica de UI. Confirmar: aplicar globalmente (todas as clínicas)? Como o bloco "Exceções" só é renderizado quando `isConvenioFuncionario`, o efeito prático fica restrito ao convênio FUNCIONARIO nas 3 clínicas. Assumo global.

## Mudança
Só front-end, em `regras-tab.tsx`:

1. No `useMemo` do `regrasFiltradas`, adicionar filtro extra que, quando `isFuncionario === true`, **descarta** linhas cujo `procedimento_id` esteja em `excecoesProcIds` **e** que correspondam ao formato de exceção (`modo === "percentual_desconto"`, `percentual === 0`, `!gratuito`, sem `limite_qtd`).
2. Incluir `isFuncionario` e `excecoesProcIds` nas dependências do `useMemo`.

Resultado: as 6 linhas de bloco (BLOCO DE CERAMICA, BLOCO EM ART GLASS, etc.) somem da tabela geral e continuam apenas no bloco "Exceções (sem desconto)". Nenhuma linha é apagada do banco — só ocultada na tabela geral. Motor de cálculo (`cb-regras.ts`) segue funcionando igual.

## Fora do escopo
- Motor de preços (não muda).
- Estrutura do banco (não muda).
- Outros convênios (só o FUNCIONARIO tem o bloco de exceções).

## Validação
Após a alteração: recarregar a tela do convênio FUNCIONARIO e conferir que (a) o bloco "Exceções" continua listando os 6 serviços, (b) a tabela "Regras de preço automáticas" não os mostra mais, (c) o cálculo de preço na agenda para esses serviços continua sem desconto (regra ainda existe no banco).

## Risco
Baixo — só filtro de exibição.
