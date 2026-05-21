# Project Memory

## Core
Toda nova funcionalidade/módulo (nova rota em src/routes/_authenticated/app.*, novo item em src/components/app-shell.tsx navRows, ou novo recurso significativo) DEVE na mesma entrega: (1) adicionar entrada em GRUPOS de src/routes/_authenticated/app.perfis.tsx no grupo correto (Operação/Inteligência/Marketing/Cadastros/Gestão/RH/Sistema) e atualizar PRESETS de cada perfil; (2) rodar migration/insert para popular perfil_permissoes de todos os perfis existentes em todas as clínicas com o acesso padrão sugerido, usando INSERT ... ON CONFLICT DO NOTHING; (3) confirmar no chat quais módulos e perfis foram atualizados.

## Memories