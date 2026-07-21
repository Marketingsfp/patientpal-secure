## Objetivo

Na aba **Mensalidades** do contrato de convênio, permitir marcar **várias parcelas de uma vez** como *Paga (histórica)* — apenas para essa modalidade (regularização fora do caixa). O botão **Pagar** normal (que lança no caixa) continua parcela a parcela.

## Comportamento proposto

1. Adicionar uma coluna de **seleção** (checkbox) nas linhas de parcelas ainda **em aberto** (não pagas e que não sejam adesão embutida). Um checkbox no cabeçalho seleciona/desmarca todas as pendentes visíveis.
2. Quando houver 1 ou mais parcelas selecionadas, aparece uma **barra de ação** acima ou abaixo da tabela com:
   - Contador: "N parcelas selecionadas — Total R$ X,XX"
   - Botão **"Marcar selecionadas como Paga (histórica)"**
   - Link "Limpar seleção"
3. Ao clicar, um único `confirm` lista os números das parcelas e o total, avisando que **não gerará movimento no caixa nem lançamento financeiro**. Após confirmação, aplica a mesma lógica atual do `marcarPagaHistorica` em lote (`update` com `.in("id", ids)`), define `pago_em = vencimento` de cada parcela e `valor_pago = valor`.
4. Depois de salvar: toast com resumo ("X parcelas marcadas como pagas (histórica)") e `load()` para recarregar.
5. A seleção só aceita parcelas **em aberto**. Parcelas já pagas, adesão embutida ("Cobrada com a 1ª parcela") e contratos cancelados (para não-admin) continuam com as mesmas restrições atuais.
6. O botão **Pagar** (com caixa) e o botão **Paga (histórica)** individual continuam existindo em cada linha — nada muda no fluxo unitário.

## Fora de escopo

- Não altera a lógica de "Pagar" com forma de pagamento (caixa/NFS-e).
- Não altera a estrutura das tabelas nem RPCs.
- Não mexe em taxa de adesão, renovação, carência ou geração de parcelas.
- Não muda regras de permissão — segue `podeEscrever` e restrição de `cancelado`/admin.

## Detalhes técnicos

- Arquivo único: `src/components/pages/contratos-page.tsx`.
- Novo estado local `selectedMensIds: Set<string>` no componente que renderiza a aba Mensalidades.
- Nova função `marcarPagasHistoricasEmLote(ids: string[])` reutilizando o mesmo `update` do `marcarPagaHistorica`, agora com `.in("id", ids)` — um único round-trip por lote. `pago_em` fica igual ao `vencimento` de cada parcela; como o UPDATE em lote não consegue setar valores por linha via `.in`, o lote itera com `Promise.all` mapeando `{id, vencimento, valor}` → chamadas individuais em paralelo (aceitável para até ~12 parcelas). Alternativa: `upsert` com array de objetos. Prefiro `Promise.all` de updates simples para manter fidelidade ao comportamento atual (mesmos campos, mesmos triggers).
- Nada de novos endpoints ou migrations.
- Confirmação (`confirm` nativo) mantém o padrão dos outros fluxos da mesma tela.

## Pergunta rápida

Faço a ação em **todas as clínicas** (Menino Jesus, SFP, Ergoclínica) ou quer restringir a alguma? Se não indicar, aplico global (é só UI, sem risco financeiro — não lança no caixa).
