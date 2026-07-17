## Objetivo

Na renovação de contrato, o campo **Nº de pessoas no contrato** (Select de faixas) deve refletir automaticamente a quantidade real de dependentes ativos toda vez que o usuário incluir, remover ou trocar um dependente — sem exigir que ele reabra o Select.

## Situação atual

`src/components/contratos/renovar-contrato-dialog.tsx` já calcula `totalPessoas = 1 + depsPreenchidosCount` e tem um `useEffect` que auto-seleciona a faixa correspondente. Porém ele só roda enquanto `faixaTocada === false`: assim que o usuário abre o Select uma vez, a flag trava e futuras alterações de dependentes deixam de atualizar a faixa. Resultado observado no print: 3 pessoas ativas, mas a faixa continua "1+ pessoas".

## Mudança (apenas front — nenhum ajuste em RPC/banco)

Em `renovar-contrato-dialog.tsx`:

1. Remover a trava `faixaTocada` do efeito de auto-seleção. A faixa passa a ser derivada sempre de `totalPessoas`, garantindo que qualquer inclusão/remoção/toggle de "manter" recalcule imediatamente.
2. Remover o `useState` `faixaTocada` e o `onValueChange` que o setava (o Select continua editável — o usuário ainda pode escolher outra faixa manualmente, mas ela será re-sincronizada assim que o número de dependentes mudar, que é o comportamento pedido).
3. Manter a auto-seleção robusta: escolher a faixa cujo intervalo `[vidas_de, vidas_ate]` contém `totalPessoas`, com fallback para a última faixa quando `totalPessoas` excede o máximo, exatamente como já está.
4. Preservar o texto de ajuda "Atualiza automaticamente conforme dependentes são incluídos ou removidos. Contrato atual: N pessoas."

## Fora do escopo

- Regras de negócio de taxas (adesão / inclusão de dependente) permanecem inalteradas.
- RPCs `renovar_contrato_extensao` / `renovar_contrato_troca_plano` não são tocadas — elas já recebem `_valor_mensal` derivado da faixa selecionada no momento do submit.
- Nenhum outro fluxo (venda, edição de contrato) é alterado.

## Validação

- Abrir renovação de um contrato quitado.
- Adicionar um dependente → faixa deve saltar para a compatível (ex.: de "1+" para "2–3 pessoas").
- Remover dependente → faixa deve voltar sozinha.
- Trocar dependente → contagem estável, faixa mantida.
- Confirmar renovação e checar que `contrato_mensalidades` foi gerado com o valor da faixa exibida.