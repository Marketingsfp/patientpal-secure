## Contexto (verificado no banco)

Contrato **#20260945** (MARCILENE BARBOSA DE LIMA):
- `valor_mensal = R$ 175,00` no cabeçalho.
- 12 parcelas em `contrato_mensalidades`, todas com `valor = 175,00` (1 paga, 11 pendentes).
- Convênio **CARTÃO CONSULTA** — faixas atuais na tabela `cb_convenio_faixas`: R$110 / R$155 / R$180 / R$205 / R$230 / R$255.

O valor R$175 é da **tabela antiga** (o próprio contrato já mostra o aviso "este contrato está na tabela antiga do Cartão Consulta"). Nenhuma faixa atual bate com R$175.

## Diagnóstico

Na aba **Dados** o formulário tem dois blocos independentes que não conversam:

1. **Nº de pessoas no contrato** (`admFaixaId`) — dropdown de faixas do convênio.
2. **Valor mensal (R$)** (`editValor`) — input numérico.

O `useEffect` de sincronização (linha 2621) faz:
```ts
const match = faixas.find(f => Number(f.valor_mensal) === valorMensalAtual) ?? faixas[0];
setAdmFaixaId(match?.id ?? "");
```

Quando o valor atual (175) **não existe em nenhuma faixa**, ele cai no `?? faixas[0]` e seleciona silenciosamente **"1+ pessoas — R$ 110,00"**. Daí vêm dois problemas:

- **Bug de UX (mostra faixa errada):** o operador vê "1+ pessoas — R$110" mesmo em contrato de 3 pessoas com valor R$175. Parece incoerente e leva a acreditar que os dados estão errados.
- **Bug de save (não persiste o que o usuário mudou):** trocar a faixa no dropdown **não** atualiza o input `Valor mensal`. Quando o operador clica **"Salvar valor e vencimento"**, `salvarDadosFinanceiros` só grava `editValor` (que continuou 175) e ignora o `admFaixaId`. Resultado percebido: "ajustei e não salvou".
- **Risco correlato:** se em vez disso o operador clicar **"Salvar dados administrativos"** (bloco ADM), o `salvarContratoAdmin` compara `novoValorMensal (110) !== valorMensalAtual (175)` e sobrescreve `valor_mensal` para R$110 **e** as parcelas em aberto para R$110 — corrompe o contrato.

**Classificação:** erro técnico de UI + risco de regra de negócio (sobrescrita silenciosa de valor).

## Correções propostas em `src/components/pages/contratos-page.tsx`

1. **Remover o fallback `?? faixas[0]`** no `useEffect` de sincronização da faixa (linha 2621). Quando não houver match exato, deixar `admFaixaId = ""` (dropdown com placeholder "Selecione a faixa…"). O dropdown volta a refletir a realidade: "nenhuma faixa atual corresponde ao valor deste contrato".

2. **Exibir aviso inline** logo abaixo do dropdown quando `admFaixaId === "" && faixas.length > 0 && valorMensalAtual > 0`:
   > "O valor atual (R$ 175,00) não corresponde a nenhuma faixa deste convênio. Selecione uma faixa para alinhar o valor, ou edite manualmente o valor mensal ao lado."

3. **Trocar a faixa deve refletir no input Valor mensal:** ao alterar `admFaixaId` no dropdown, atualizar automaticamente `editValor` com o `valor_mensal` da faixa escolhida. Assim, clicar em "Salvar valor e vencimento" passa a persistir o valor da faixa e a marcação "Regerar 12 parcelas futuras" funciona como esperado.

4. **Blindar `salvarContratoAdmin`** para não sobrescrever `valor_mensal`/parcelas quando o usuário **não mudou** a faixa explicitamente. Passa a enviar `valor_mensal` apenas se o usuário selecionou uma faixa cujo valor difere do atual **E** essa faixa foi alterada em relação à sincronização inicial (guardar `admFaixaIdInicial` em ref). Isso elimina o risco de rebaixar de R$175 para R$110 sem intenção.

## Ajuste operacional do contrato #20260945

Depois das correções, orientar o operador:
- Ou selecionar a faixa **"3 pessoas — R$ 180,00"** e clicar em "Salvar valor e vencimento" com "Regerar 12 parcelas futuras" marcado (11 parcelas pendentes passam a R$180; a paga permanece).
- Ou manter o valor histórico R$175 (tabela antiga) e apenas ignorar a faixa — o aviso deixa claro que o contrato está em tabela legada.

Não altero o registro agora — a decisão de migrar para R$180 ou preservar R$175 é operacional, e você já sinalizou que as parcelas estão do jeito que devem.

## Escopo / fora do escopo

- **Dentro:** o formulário Dados de `contratos-page.tsx` (sincronização faixa ↔ valor, aviso, blindagem do save).
- **Fora:** fluxo de venda, renovação, tabela `cb_convenio_faixas`, migração massiva de contratos legados.

## Validação

- Reabrir o contrato #20260945 e conferir que o dropdown vem vazio com o aviso.
- Selecionar "3 pessoas — R$180", ver o campo Valor mensal atualizar para 180,00, salvar e conferir no banco que `contratos_assinatura.valor_mensal = 180` e as 11 parcelas pendentes ficaram R$180 (a paga preservada).
- Em outro contrato com faixa exata, garantir que a UI continua auto-selecionando a faixa e nada muda ao salvar sem interação.

## Pendências

- Confirmar comigo se prefere que eu também **atualize o contrato #20260945 para R$180 (3 pessoas)** após o ajuste da UI, ou se mantém R$175 (tabela antiga) e apenas evita o rebaixamento.
