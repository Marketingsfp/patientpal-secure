## O que já existe (base atual)

Quando alguém clica **Pagar** em uma mensalidade do Cartão Benefício (`contratos-page.tsx`), abre o **LancamentoDialog** com `categoriaFixaNome: "MENSALIDADE CARTAO CONSULTA"`. Esse diálogo já:

1. Insere em `fin_lancamentos` (Mov. Caixa / Financeiro).
2. Abre automaticamente uma sessão de caixa do atendente logado se ele não tiver uma.
3. Insere em `caixa_movimentos` (Movimentos da Sessão), com `user_id = auth.uid()` e `sessao_id` da sessão aberta.

Consulta na base confirmou que a última mensalidade paga hoje (parcela 7/12 do contrato #20261878) gerou o registro corretamente em `caixa_movimentos`. Ou seja, o mecanismo já existe — mas o usuário relata que **na tela não aparece**. Preciso reproduzir para achar o ponto exato da falha antes de mexer no código.

## Hipóteses do porquê "não aparece"

1. **Erro silencioso no bloco de caixa** — o `try/catch` em `lancamento-dialog.tsx` (linhas 590-645) engole qualquer falha de RLS/abertura de sessão com um `console.error`. Se algum insert falhar (ex.: `is_member(user, clinica)` retornar false para o perfil de caixa, política de INSERT bloquear), o pagamento é gravado no financeiro mas **não** entra no caixa — sem feedback visual.
2. **Sessão auto-aberta em outra clínica/contexto** — se o atendente troca de clínica entre pagar e olhar o caixa, o `load()` de `/app/caixa` só busca sessão aberta da clínica atual e não encontra a movimentação.
3. **Filtro da aba "Meu caixa"** — em `app.caixa.tsx` linha 488, `minhasMovs` só carrega movimentos da **sessão aberta**. Se a sessão foi fechada (ou o atendente entrou em outro dia), a mensalidade paga hoje some dessa aba mas ainda existe no banco.
4. **Categoria "MENSALIDADE CARTAO CONSULTA" não cadastrada** — se a categoria não existir na clínica, o `fin_lancamentos.insert` pode falhar antes do bloco de caixa, e o `try` do caixa nem chega a rodar.

## Plano

### 1. Reproduzir e diagnosticar
- Peço ao usuário o **nome do atendente**, a **clínica** e o **contrato** onde ele testou. Puxo do banco: `caixa_sessoes` desse atendente (abertas/fechadas hoje), `caixa_movimentos` da sessão, `fin_lancamentos` da mensalidade correspondente e a categoria `MENSALIDADE CARTAO CONSULTA` na clínica.
- Se o `fin_lancamento` existir mas o `caixa_movimento` não → problema no bloco de caixa (hipótese 1). Se ambos existem em outra sessão → hipótese 2 ou 3.

### 2. Fechar as brechas identificadas em `lancamento-dialog.tsx`
- Transformar o `console.error` do bloco de caixa em **toast de aviso** ("Lançamento salvo, mas não foi possível registrar no caixa: <erro>"). Assim qualquer falha futura fica visível no ato — nada de "não aparece" silencioso.
- Garantir que `descricao` do `caixa_movimentos` inclua o **nome do paciente + parcela + nº do contrato** (já é o caso via `initialDescricao` do contrato). Sem alteração de dados.

### 3. Ajustes na visualização em `app.caixa.tsx` (se hipótese 3 for a causa)
- Na aba **"Meu caixa"** (`tab === "meu"`), quando **não há sessão aberta**, ao invés de mostrar `minhasMovs = []`, buscar os movimentos das sessões recentes do próprio usuário (últimas 20 já são carregadas em `histRes`) filtradas pelo período selecionado. Assim, pagamentos feitos numa sessão que já foi encerrada continuam visíveis para o atendente que fez.
- Nenhuma mudança em RLS ou schema.

### 4. Validação
- Reproduzir o pagamento de uma mensalidade nova, confirmar visualmente:
  - Linha aparece em **Mov. Caixa** (`/app/financeiro/movimento`) com categoria "MENSALIDADE CARTAO CONSULTA".
  - Linha aparece em **Movimentos da Sessão** (`/app/caixa` → aba "Meu caixa") do atendente que clicou em Pagar.
- Se o diagnóstico apontar que precisa também gerar movimento para parcelas marcadas como "já pagas anteriormente" no cadastro do contrato, alinho com o usuário antes de mexer (é comportamento retroativo).

### Detalhes técnicos

- Arquivos a editar: `src/components/financeiro/lancamento-dialog.tsx` (toast do bloco caixa) e possivelmente `src/routes/_authenticated/app.caixa.tsx` (fallback quando não há sessão aberta).
- Sem migração de banco. Sem mudança em `contratos-page.tsx` (o fluxo já está correto lá).
- Sem alteração das políticas RLS existentes.

Assim que o plano for aprovado, começo pela reprodução (item 1) — preciso do nome do atendente e do contrato onde o pagamento "sumiu".