## Diagnóstico

A coluna com os checkboxes de repasse (e o botão "Pagar repasse") em `src/routes/_authenticated/app.financeiro.atendimentos.tsx` só é escondida em UM caso: quando `isMedicoOnly === true`, o que acontece se `clinica_memberships.role === "medico"` para o usuário logado (`useMedicoContext`).

Nada além disso esconde os checkboxes — não há gate por permissão custom, nem por `role` para "financeiro"/"recepcao". Ou seja: **a atendente da tesouraria está registrada na clínica com role `medico` por engano** (ou o usuário dela está vinculado a um cadastro em `medicos` que faz o sistema tratá-la como médica).

## Confirmação (antes de mexer em código)

Preciso do e-mail (ou nome) da atendente para checar direto no banco:

1. `SELECT role FROM clinica_memberships WHERE user_id = ... AND clinica_id = ...` — deve retornar `financeiro` (ou `recepcao`/`admin`). Se vier `medico`, é a causa.
2. `SELECT id, nome, email, ativo FROM medicos WHERE user_id = ... OR email ILIKE ...` — se aparecer, o sistema também pode marcar como médica pelo casamento de e-mail.

## Correção

- **Caso 1 — role errado**: alterar o `role` da atendente para `financeiro` na tabela `clinica_memberships` (Cadastros › Equipe, ou eu ajusto via update).
- **Caso 2 — vínculo residual em `medicos`**: desativar/desvincular o `user_id` (ou e-mail) do cadastro em `medicos` para que `useMedicoContext` não a identifique como médica.

Nenhuma alteração de código é necessária — o comportamento atual está correto (esconder ações de repasse de usuários médicos). Só falta ajustar o dado do usuário dela.

## 4 eixos

- 💰 Nenhum — só destrava a operação diária de pagamento de repasse.
- ⏱️ Elimina bloqueio operacional; atendente volta a marcar repasses sem depender de outro usuário.
- 😊 —
- 🛡️ Auditoria: mudar `role` gera log em `audit_log` (padrão do sistema).

## Próximo passo

Me envia o nome ou e-mail da atendente que está sem os checkboxes e eu confirmo a causa e ajusto o cadastro.
