## Objetivo
Organizar o conteúdo da aba "Meu caixa" (rota `/app/caixa`) em 4 sub-abas para reduzir a poluição visual. Nenhuma regra de negócio, cálculo, permissão, filtro ou fluxo (recebimento, estorno, cobrança) é alterada — apenas o agrupamento visual.

## Sub-abas propostas (dentro de "Meu caixa")

1. **Saldo** (padrão ao entrar)
   - 4 cards: Saldo atual, Abertura, Entradas, Saídas
   - Card "Entradas por forma de pagamento" (Dinheiro/PIX/Débito/Crédito/etc.)
   - Barra de ações: Suprimento · Sangria · Recebimento · Despesa · Fechar caixa

2. **Movimentos**
   - Card "Movimentos da sessão / Movimentos de hoje" com o seletor de período (para gestor), tabela completa e todas as colunas atuais (Data, Hora, Tipo, Descrição, Serviço, Médico, Forma, Valor, Ação de estorno).

3. **Histórico**
   - Card "Meu histórico" (tabela de sessões anteriores do próprio operador com abertura/fechamento/diferença/detalhe).

4. **Aguardando**
   - Card "Cobrança de pacientes (N aguardando)" com o grid de fichas e botão "Cobrar".
   - Manter o mesmo comportamento do atalho `?receber=...` (abrir diálogo de cobrança).

## Detalhes técnicos
- Arquivo único: `src/routes/_authenticated/app.caixa.tsx`.
- Envolver o conteúdo atual de `<TabsContent value="meu">` em um segundo `<Tabs>` interno com `defaultValue="saldo"` e `TabsList` com os 4 gatilhos.
- Preservar o guard `!minhaSessao` (mostrando o card "Abrir caixa") acima das sub-abas — sem caixa aberto, as sub-abas ficam ocultas.
- Preservar `loading`, estados, handlers, `enrichPorLanc`, `estornosPorLanc`, atalho `?receber=…`, exports e diálogos existentes.
- Nenhum novo estado persistido; a sub-aba selecionada é apenas UI local (`useState`).
- Sem mudanças nas abas "Todos (Financeiro)" e "Repasse médico".

## Fora de escopo
- Cálculos, RLS, schema, permissões, fluxo de estorno, impressão, KPIs.
- Aba "Todos (Financeiro)" e "Repasse médico".
- Feature flag `caixa_v2` / `CaixaShellV2` (essas telas não são tocadas).