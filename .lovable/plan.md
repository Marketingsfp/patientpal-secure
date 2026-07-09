## Causa raiz

Ao aprovar um estorno na aba **Estorno**, a função `executarEstorno` (em `src/routes/_authenticated/app.financeiro.estorno.tsx`) tenta:

1. `DELETE` em `caixa_movimentos`
2. `DELETE` em `fin_lancamentos`
3. `UPDATE agendamentos SET status='agendado'`

O problema: as policies **DELETE** de `caixa_movimentos` e `fin_lancamentos` só permitem `admin`/`gestor` (função `can_manage_clinica`). Para usuários `financeiro`, o Supabase **não retorna erro** — apenas afeta 0 linhas. Já o UPDATE do agendamento passa (policy `is_member`).

Resultado: o agendamento fica `status='agendado'`, mas o `fin_lancamentos` (receita `confirmado`) permanece. Como a agenda calcula "pago" via `fin_lancamentos WHERE tipo='receita' AND status='confirmado' AND agendamento_id=...`, ela continua mostrando a ficha como **PAGO** (ou some do quadrante correto), fazendo parecer que o estorno "não aparece".

Confirmado no banco: MERCIA (aprovado 15:03) — agendamento voltou a `agendado`, mas `fin_lancamentos` original ainda existe com `status='confirmado'`.

O fluxo antigo funcionava porque estava executado por um `admin`, então o DELETE passava. Ao migrar o botão para a aba Estorno usada pelo financeiro, a policy passou a bloquear silenciosamente.

## Correção

Trocar `DELETE` por `UPDATE status='estornado'` — que o `financeiro` pode fazer (policy UPDATE = `is_member`) — em `fin_lancamentos`. E ajustar o filtro do `pagosSet` da agenda para considerar apenas `status='confirmado'` (já é o caso), garantindo que lançamentos `estornado` não contem como pago.

Passos concretos:

1. **`executarEstorno`** em `src/routes/_authenticated/app.financeiro.estorno.tsx`:
   - Remover o `DELETE` do `fin_lancamentos`.
   - Substituir por `UPDATE fin_lancamentos SET status='estornado', updated_at=now() WHERE id = lanc.id`.
   - Remover o `DELETE` do `caixa_movimentos`; adicionar um **novo `caixa_movimentos`** (INSERT is_member permite) do tipo `saida` com `lancamento_id=null` e descrição `"Estorno de <descrição original>"` e valor negativo/positivo conforme o fluxo do caixa. Assim o caixa reflete a saída, sem depender de DELETE.
   - Manter o `UPDATE agendamentos SET status='agendado', fluxo_etapa='aguardando_recepcao'`.
   - Manter `logAction` (auditoria).

2. **Aba Atendimentos (`app.financeiro.atendimentos.tsx`)**: já filtra `fin_lancamentos.status='confirmado'` na query, então lançamentos `estornado` desaparecem naturalmente da listagem. Verificar se os agregados/relatórios (`Mov. Caixa`, `Analítico`, `Notas`) também filtram `status='confirmado'`; se algum lê tudo, adicionar filtro `neq('status','estornado')` para não somar valores estornados.

3. **Compatibilidade com dados antigos**: os estornos aprovados anteriormente que ficaram com `fin_lancamentos` órfão precisam ser corrigidos manualmente. Depois de subir a correção, marcar como `estornado` todos os `fin_lancamentos` cujo `agendamento_id` está em `estorno_solicitacoes` com `status='aprovado'` (script one-shot).

## 4 eixos

- 💰 Alto positivo — hoje o financeiro "aprova" mas o lançamento continua contando como receita e o caixa fica desalinhado.
- ⏱️ Elimina retrabalho manual (pedir para admin refazer o estorno).
- 😊 Recepção volta a enxergar a ficha como "disponível para agendar".
- 🛡️ Auditoria mantida via `audit_log`; policies não precisam ser afrouxadas.

## Fora de escopo

- Não vou mexer no fluxo de devolução por PIX/transferência (isso está no plano de estorno com caixa sem saldo, que você adiou).
