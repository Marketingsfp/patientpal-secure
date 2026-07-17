## O que muda

Hoje a **Taxa de adesão** aparece em uma faixa separada acima da tabela de Mensalidades, e a **Taxa de inclusão de dependente** aparece dentro da tabela mas **sem botão de pagar**. O usuário quer as duas na mesma tabela, com botão "Pagar" próprio, e cada pagamento precisa gerar movimento financeiro no caixa.

O plano é tratar as duas como linhas normais da tabela de Mensalidades, cada uma com seu próprio botão de pagamento que abre o mesmo diálogo de forma de pagamento já usado pelas mensalidades e grava lançamento + movimento de caixa.

## Escopo (só frontend)

Arquivo único: `src/components/pages/contratos-page.tsx`. Nenhuma alteração de banco, RLS, trigger ou regra de negócio de cálculo de valores/parcelas.

## Mudanças

1. **Remover a faixa "Taxa de adesão" acima da tabela** (bloco atual em ~linha 3015).
   Ela vira redundante quando a linha aparece dentro da tabela.

2. **Incluir as taxas na listagem da tabela de Mensalidades**
   - Trocar o filtro `mensalidades = mens.filter(!isEncargoAvulso)` por um `mens` completo **ordenado** com adesão no topo, depois taxas de inclusão, depois parcelas mensais em ordem.
   - A renderização já sabe distinguir adesão e taxa inclusão (badges "Adesão" e "Taxa inclusão") — apenas passará a receber essas linhas de novo.
   - A contagem "N/M" das mensalidades continua usando `isEncargoAvulso` (predicado já existente), então o total de parcelas mensais não muda.

3. **Habilitar o botão "Pagar" para adesão e taxa inclusão**
   - Quando a linha for adesão ou taxa inclusão e estiver pendente, mostrar o mesmo botão "Pagar" das mensalidades.
   - Ao clicar, abrir o mesmo diálogo de forma de pagamento já usado, passando:
     - Adesão → categoria `TAXA DE ADESAO CARTAO`, descrição `Taxa de adesão — Contrato #X — Nome`.
     - Taxa inclusão → categoria `DEPENDENTE / ADESAO CARTAO`, descrição já existente (`Taxa de inclusão de dependente — Nome`).
   - O diálogo grava **lançamento financeiro + movimento de caixa** atomicamente (RPC `fn_registrar_lancamento_e_caixa`, o mesmo caminho usado hoje) e depois marca a linha em `contrato_mensalidades` como paga com `lancamento_id` e `valor_pago` preenchidos.

4. **Preservar o comportamento atual de "pagar a 1ª mensalidade também paga adesão"**
   - O código atual junta adesão + 1ª parcela em uma única cobrança. Isso continua igual — só que agora, se a adesão ainda estiver pendente (ex.: 1ª parcela foi "paga histórica"), o operador consegue quitar a adesão sozinha pelo botão novo.
   - Contratos onde a adesão já foi paga junto com a 1ª parcela mostram a linha com status "Pago" e sem botão — igual às demais.

5. **Botão "Reverter" também para adesão e taxa inclusão**
   - Quando pagas via o botão novo, a linha guarda `lancamento_id`, então o fluxo de "Reverter" existente (estorno + reabertura) funciona automaticamente. Sem código extra.

6. **"Paga (histórica)"**
   - Também disponível para adesão e taxa inclusão, permitindo regularizar cobranças pagas fora do sistema **sem** movimento de caixa (é o comportamento explícito do botão histórico e mantém a semântica atual).

## Fora do escopo

- Sem migração de banco.
- Sem mudança na criação de contrato (adesão embutida na 1ª parcela) ou na inclusão de dependente (criação da linha da taxa).
- Sem mudança no botão "Adicionar parcela" ou nas regras de juros/multa.
- Sem mudança em impressão de carnê/boleto/A4.

## Riscos e validação

- **Risco baixo**: as linhas de adesão e taxa inclusão já existem em `contrato_mensalidades` e o esquema (lancamento_id, valor_pago, forma_pagamento) já suporta o pagamento. Só falta o gatilho na UI.
- **Duplo lançamento**: cuidar para que, quando o operador pagar a 1ª mensalidade (que ainda arrasta a adesão pelo fluxo atual), o botão da linha da adesão fique **oculto**/desabilitado se a adesão estiver embutida — ou seja, se a 1ª parcela ainda tem `taxa_adesao > 0` e está pendente, a linha da adesão mostra "Cobrada com a 1ª parcela" em vez de "Pagar". Isso evita cobrar 2x.
- Validação manual sugerida: (a) contrato novo, pagar 1ª parcela e conferir que adesão consta como paga com lançamento próprio; (b) contrato com dependente incluído após a venda — pagar a taxa inclusão e conferir 1 lançamento + 1 movimento de caixa; (c) "Reverter" nos dois casos.
