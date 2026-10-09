---
name: Atualizar o Git antes de alterações
description: Preferência explícita do usuário: executar git pull antes de começar a editar.
type: preference
---

Antes de começar qualquer alteração neste repositório, conferir `git status` e executar `git pull` na branch de trabalho.

Se o pull for impedido por alterações locais ou houver conflito, parar e informar o usuário. Preservar o trabalho local e de outros colaboradores: não fazer stash, descarte, commit automático ou resolução de conflitos por conta própria para contornar o bloqueio.

Solicitado pelo usuário em 2026-10-01 para todas as próximas tarefas.
