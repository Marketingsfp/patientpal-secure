## Objetivo

1. Quando um agendamento já estiver com status **Realizado**, a opção **Reagendar** no menu de ações da Agenda deve ficar desabilitada (não permitir reagendar atendimento que o médico já fechou).
2. Em **Financeiro → Atendimentos**, criar a ação **Estornar atendimento** disponível para os perfis **admin / gestor / financeiro**. O estorno volta o status do agendamento para **Agendado**, para o caso de o médico ter marcado "Realizado" por engano.

## Mudanças

### 1) `src/routes/_authenticated/app.agenda.tsx` — desabilitar Reagendar quando realizado

No `DropdownMenuItem` do "Reagendar" (linha ~1591), tornar o item desabilitado quando `a.status === "realizado"`:

- Adicionar `disabled={a.status === "realizado"}` no item.
- Em `iniciarReagendamento(a)`, fazer guard: se `a.status === "realizado"`, mostrar toast "Atendimento já realizado — peça ao financeiro para estornar antes de reagendar" e retornar.

Apenas mudança visual/comportamental no menu; o restante do fluxo de reagendamento por slot já existente continua igual.

### 2) `src/routes/_authenticated/app.financeiro.atendimentos.tsx` — ação Estornar

Contexto: a tela já mistura duas origens:
- `origem: "agenda"` → item vem de `fin_lancamentos` (receita confirmada com `agendamento_id`), correspondente a um agendamento que foi cobrado e o médico marcou como realizado.
- `origem: "manual"` → registro em `fin_atendimentos`, sem vínculo direto com agendamento.

Adicionar:

- Hook de permissão (inline no componente):
  ```ts
  const podeEstornar = ["admin","gestor","financeiro"].includes(clinicaAtual?.role ?? "");
  ```
- Nova coluna "Ações" / botão por linha (ou item no menu da linha existente) **Estornar**, visível apenas quando `podeEstornar` for verdadeiro e `!a.repasse_pago` (não permitir estornar atendimento cujo repasse já foi pago — mensagem clara no toast caso tente).
- Função `estornar(a: Atend)`:
  1. `confirm("Estornar este atendimento? O agendamento voltará para o status 'Agendado'.")`
  2. Buscar `agendamento_id`:
     - Se `a.origem === "agenda"`: ler `agendamento_id` de `fin_lancamentos` pelo `a.id`.
     - Se `a.origem === "manual"`: buscar em `fin_atendimentos` o `agendamento_id` (campo já existente na tabela — se não existir, só desfazer o status manual).
  3. Atualizar `agendamentos.status = 'agendado'` quando houver `agendamento_id`.
  4. Apenas reverter status do agendamento — **não mexer no financeiro** (foi a opção confirmada pelo usuário). O lançamento de receita permanece como está; o repasse continua devido (e por isso bloqueamos estorno quando repasse já foi pago, para evitar inconsistência).
  5. Toast de sucesso e `await load()`.
- Registrar a ação na trilha de auditoria via `logAction` (importar de `@/hooks/use-crud`) com `table_name: "agendamentos"`, `action: "ESTORNO"`, `dados_antes/depois` com o id e status.

### 3) Sem mudanças em perfis/permissões

Conforme decidido, **não** criar perfil novo. A ação é liberada para quem já tem o role `financeiro` (mais `admin`/`gestor`), que é o gate atual de acesso à seção Financeiro. Nenhuma migration, nada em `app.perfis.tsx`, nada em `perfil_permissoes`.

## Validação

- Marcar um agendamento como "Realizado" na agenda → item "Reagendar" do menu deve aparecer cinza/desabilitado.
- Logar como perfil `financeiro` → em Financeiro → Atendimentos, botão "Estornar" aparece nas linhas com repasse em aberto; após clicar e confirmar, voltar à Agenda e ver o agendamento de volta como "Agendado", agora com "Reagendar" liberado novamente.
- Logar como perfil `recepcao` ou `medico` → botão "Estornar" não aparece.
