## Objetivo

Criar uma nova aba **"Estorno"** no menu lateral de Financeiro (logo abaixo de "Atendimentos"), consolidando todo o fluxo de solicitações de estorno que hoje aparece como um card rosa dentro da página `/app/financeiro/atendimentos`.

## Arquivos

### 1. `src/routes/_authenticated/app.financeiro.estorno.tsx` (novo)

Nova rota `/app/financeiro/estorno` com o componente `Page`, `head()` "Estorno — Financeiro". Reúne:

- **Carregamento das solicitações**: mesma consulta a `estorno_solicitacoes` já existente em `app.financeiro.atendimentos.tsx` (linhas 462-475), agora com filtro de status configurável — por padrão "pendente", mas com abas/toggle "Pendentes / Aprovadas / Recusadas / Todas" e range de datas simples.
- **Realtime**: mesma inscrição no canal `fin-estornos-{clinicaId}` (linhas 480-501) para atualizar a lista quando novas solicitações chegarem.
- **Ação Aprovar e Estornar**: replica `aprovarSolicitacao` (linhas 503-530). Como a página não possui a lista `items` de atendimentos (que hoje serve para resolver `alvo`), o fluxo passa a:
  1. Se `lancamento_id` presente, buscar direto em `fin_lancamentos` os campos `id, agendamento_id, valor, descricao` e em `fin_atendimentos` (view) os campos `origem, repasse_pago` para pré-validar.
  2. Executar a mesma sequência de `estornar()` (linhas 1078-1153): valida `repasse_pago === false` e `origem === "agenda"`, apaga `caixa_movimentos` do lancamento, apaga `fin_lancamentos`, volta `agendamentos.status` para "agendado" e `fluxo_etapa` para "aguardando_recepcao", registra `logAction` com `action: "ESTORNO"`.
  3. Marca a solicitação como `aprovado` com `resposta` "Estorno executado" (ou "Aprovado manualmente" se o lançamento não foi encontrado / repasse já pago — nesses casos exibe toast informativo mas ainda encerra a solicitação, mantendo o comportamento atual).
- **Ação Recusar**: replica `rejeitarSolicitacao` (linhas 532-555) — `window.prompt` para motivo, marca como `rejeitado`.
- **Permissão**: mesma checagem `podeEstornar = role ∈ {admin, gestor, financeiro}` (linha 149). Sem permissão, mostra Card "Acesso restrito" e não carrega os botões de ação.
- **Colunas exibidas** por solicitação (mesmo layout do card atual, mas em uma tabela full-width):
  - Data/hora solicitada
  - Paciente
  - Descrição
  - Valor
  - Tipo (badge "Erro de caixa" / "Devolução")
  - Motivo
  - Datas do pagamento original / previsão de devolução (quando `tipo = devolucao`)
  - Status (badge)
  - Resolvido por / em / resposta (quando concluída)
  - Ações (Aprovar/Recusar quando pendente; somente leitura para o restante).
- **Filtros locais**: busca por paciente/descrição, filtro por tipo, filtro por status, range de datas (`solicitado_em`). Sem persistir estado — mesmos moldes do resto do módulo Financeiro.
- **Export**: botão "Exportar Excel" reutiliza `exportToExcel` de `@/lib/export-csv` como em outras páginas.

Não altera schema, RLS, RPCs, permissões ou o fluxo de solicitação (Caixa continua criando `estorno_solicitacoes` como hoje).

### 2. `src/routes/_authenticated/app.financeiro.tsx`

Adicionar item na `subnav` **logo depois de "Atendimentos"**:

```
{ to: "/app/financeiro/estorno", label: "Estorno", icon: Undo2 }
```

`Undo2` já é usado em `atendimentos` e representa bem o fluxo. Manter o modo `isMedicoOnly` inalterado (a aba não aparece para médicos, que já veem só "Repasse").

### 3. `src/routes/_authenticated/app.financeiro.atendimentos.tsx`

Remover o card rosa "N solicitação(ões) de estorno pendente(s)" (linhas 1376-1434) e o estado/efeitos correlatos (linhas 448-555) para não duplicar a funcionalidade. No lugar do card, colocar um **link discreto** no topo da página quando houver pendências, do tipo:

> "N solicitação(ões) de estorno pendente(s) → Abrir aba Estorno"

Esse link é apenas um badge com `Link to="/app/financeiro/estorno"`, mantendo a inscrição realtime só para atualizar a contagem (sem a lista completa nem as ações). Assim continua havendo um alerta visível na aba original, mas todo o gerenciamento acontece na nova aba.

## O que não muda

- Schema/tables `estorno_solicitacoes`, `fin_lancamentos`, `agendamentos`, `caixa_movimentos`.
- Fluxo de criação de solicitação a partir do caixa/recepção (`SolicitarEstornoDialog`, `EstornosBell`, etc.).
- Lógica interna de `estornar` (validações, ordem de exclusão, auditoria).
- Permissões (`podeEstornar`).

## Riscos e mitigação

- **Duplicidade acidental**: manter a lógica inteira do estorno em um único lugar (nova aba) evita que uma solicitação seja aprovada em duas telas ao mesmo tempo. O badge de contagem na aba Atendimentos é apenas atalho.
- **Regressão do `estornar`**: como a nova aba reproduz o `estornar` sem depender de `items`, adicionamos as duas pré-checagens (`repasse_pago`, `origem = "agenda"`) via SELECT antes de executar, com toasts idênticos aos atuais.
