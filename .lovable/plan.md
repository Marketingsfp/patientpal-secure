## Objetivo
Centralizar todo cadastro de funcionário em **Recursos Humanos → Funcionários** (rota `/app/hr-contratos`). O item **Equipe** passa a mostrar apenas a aba **Médicos**. Nenhum usuário perde acesso — só mudam as portas de entrada da UI.

## Clínica-alvo
Aplicar para **todas as clínicas** (mudança estrutural de UI/menu, sem regra de negócio por clínica). Confirmo antes de executar caso queira restringir.

## Antes × Depois

**Antes**
- `/app/equipe` (aba Funcionários) — cria/edita login + perfil via `FuncionarioFormDialog`
- `/app/funcionarios` — lista alternativa vinculada ao contrato (`FuncionarioDadosDialog`)
- `/app/hr-contratos` — contrato de trabalho (dados trabalhistas + criar login só no cadastro novo)
- `/app/equipe/funcionario/:userId/editar` — página de edição do funcionário via Equipe

**Depois**
- `/app/hr-contratos` — **única** porta de entrada para funcionários (lista com busca, novo, editar, excluir)
- `/app/hr-contratos/:id` — página de edição com abas:
  - **Dados do contrato** (nome, CPF, cargo, setor, regime, salário, admissão, demissão, status, sexo, e-mail/telefone/nascimento já existentes)
  - **Acesso ao sistema** (perfil/role, ativar/desativar login, e-mail de login somente leitura, "Definir/Alterar senha", vincular a login existente quando o contrato ainda não tem `user_id`)
- `/app/equipe` — mostra apenas a aba **Médicos** (chooser vira botão único "Novo médico"; título passa a "Médicos")

## Passos

### 1. Página de edição em RH (`app.hr-contratos.$id.tsx`)
Ampliar a aba **Acesso ao sistema** para também funcionar em edição (hoje bloqueia com "não pode ser alterado"):
- Se o contrato tem `user_id`: mostrar e-mail (leitura), perfil (`clinica_memberships.role`), toggle Ativo/Inativo, botão **Definir nova senha** (usa `definirSenhaFuncionario`), salvar role via `editarMembro`.
- Se o contrato **não** tem `user_id`: opção "Criar login agora" (fluxo atual) **ou** "Vincular a um login existente da clínica" (select dos memberships sem contrato).
- Reaproveita 100% os server functions já existentes em `src/lib/equipe.functions.ts` (`cadastrarUsuario`, `editarMembro`, `getFuncionarioLogin`, `definirSenhaFuncionario`). Sem mudanças em backend/RLS/migrations.

### 2. Página Equipe (`app.equipe.index.tsx`)
- Remover a aba **Funcionários** e o chooser de tipo.
- Deixar só a listagem de **Médicos** (badge, filtros, edição existentes intactos).
- Título: "Médicos" · Botão único: "Novo médico".
- Manter rota `/app/equipe/medico/:medicoId/editar` (não mexe).
- Deletar rota `/app/equipe/funcionario/:userId/editar` (`app.equipe.funcionario.$userId.editar.tsx`).

### 3. Rotas legadas de funcionário
- Excluir `src/routes/_authenticated/app.funcionarios.tsx` e `app.funcionario.$userId.tsx` (substituídas por `/app/hr-contratos`).
- Redirecionar qualquer link antigo para `/app/hr-contratos` (busca em `command-palette.tsx`, `app-shell.tsx`, `permissoes-rotas.ts`, `section-tabs.tsx`).

### 4. Menu lateral (`app-shell.tsx`) + subsistema
- Em **Recursos Humanos**, renomear "Contratos" para **"Funcionários"** apontando para `/app/hr-contratos`.
- Manter "Equipe" no menu (subsistema Gestor Clínico) apenas como **Médicos**; opcionalmente renomear o item para "Médicos".

### 5. Permissões
- Módulo `hr-contratos` já existe e continua rezendo a página. Nenhum ajuste em `perfil_permissoes` — quem já tinha acesso ao contrato passa a gerenciar o login também (mesma equivalência funcional do `equipe` de hoje para admin/gestor). Sem migration.

## Validação (sem risco a usuários ativos)
1. Editar um funcionário existente com login: alterar nome, trocar perfil, desativar, definir nova senha — verificar em `clinica_memberships` e `auth.users`.
2. Cadastrar funcionário novo com "Criar login" e sem login.
3. Vincular contrato existente sem `user_id` a um login solto.
4. Excluir funcionário (fluxo atual da lista) — checar cascata como hoje.
5. Confirmar que `/app/equipe` só mostra Médicos e que o menu de RH abre a lista nova.
6. Buscar por links quebrados: `command-palette`, `section-tabs`, favoritos.

## Fora do escopo
- Médicos (permanece em Equipe conforme escolha do usuário).
- Backend/RLS/schema — nada muda.
- Regras de negócio por clínica.
