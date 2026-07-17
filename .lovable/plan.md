## Objetivo
Quando o check-in for feito na tela do **Totem** (autoatendimento), registrar isso no histórico do agendamento, para que o time consiga distinguir de um check-in feito manualmente pela recepção.

## Situação atual (verificado)
- O totem chama duas RPCs anônimas: `totem_checkin_cpf` e `totem_checkin_paciente`. Ambas só fazem `UPDATE agendamentos SET fluxo_etapa='recepcao', fluxo_atualizado_em=now()` — sem nenhum marcador de origem.
- A RPC `checkin_agendamento(_token)` (link/QR do comprovante) faz o mesmo update, também sem marcar origem.
- A aba **Histórico** do agendamento (`src/routes/_authenticated/app.agenda.tsx`, por volta da linha 1367) já lê a tabela `agendamento_historico_notas` e mostra as entradas em ordem cronológica junto com o audit_log. Ou seja, basta gravar uma nota do sistema para aparecer automaticamente no histórico.
- Hoje, no audit_log, o UPDATE feito pela RPC do totem aparece como uma alteração genérica de `fluxo_etapa` sem autor — indistinguível de outras alterações.

## Mudanças propostas

### 1. Migração (banco)
Atualizar as três RPCs de check-in via SECURITY DEFINER para inserirem uma linha em `agendamento_historico_notas` marcando a origem:

- `totem_checkin_cpf` → nota: **"Check-in realizado pelo Totem (CPF)"**, `user_nome='Totem'`, `user_email=null`.
- `totem_checkin_paciente` → nota: **"Check-in realizado pelo Totem (reconhecimento facial)"**, `user_nome='Totem'`.
- `checkin_agendamento` (link/QR do comprovante) → nota: **"Check-in realizado pelo link do comprovante"**, `user_nome='Autoatendimento'`.

A inserção só ocorre quando o check-in efetivamente move o fluxo para `recepcao` (não repetir se o paciente já estava em triagem/atendimento).

Nenhuma alteração de schema é necessária — a tabela `agendamento_historico_notas` já existe e comporta esse tipo de registro.

### 2. Frontend
Na aba Histórico do agendamento (`app.agenda.tsx`) o bloco de notas já renderiza `user_nome` + `texto` + `created_at`, então o registro aparecerá automaticamente. Ajuste mínimo: destacar visualmente (badge cinza "Totem" / "Autoatendimento") quando `user_email IS NULL` e `user_nome IN ('Totem','Autoatendimento')`, para o time bater o olho e reconhecer.

## Fora do escopo
- Não vou alterar a lógica do totem em si, nem o layout da tela do totem.
- Não vou renomear ou adicionar colunas em `agendamentos`.
- Não vou mexer em outras telas de histórico (financeiro, prontuário) — o pedido é sobre o histórico do agendamento na Agenda.

## Riscos
- Baixo. As RPCs continuam com o mesmo retorno; só acrescentam um INSERT em `agendamento_historico_notas`. Se o INSERT falhar por RLS/policy, a RPC precisa continuar concluindo o check-in — vou envolver o INSERT em `BEGIN ... EXCEPTION WHEN OTHERS THEN NULL; END;` para não quebrar o fluxo do paciente no totem.

## Validação
- Teste manual: abrir `/totem`, fazer check-in por CPF de um agendamento de teste, abrir a tela do agendamento na Agenda → aba Histórico e conferir a nota "Check-in realizado pelo Totem (CPF)".
- Repetir para o fluxo por link (`/checkin/<token>`).
- Conferir que um check-in feito pela recepção (fluxo manual) continua não gerando essa nota.

Pendência para confirmar antes de implementar: você quer que eu inclua também o check-in via link do comprovante (`/checkin/<token>`), ou apenas o que sai do Totem físico?
