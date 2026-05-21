## Objetivo

Unificar o cadastro de funcionário em **um único lugar** — a aba **Equipe → Funcionários** — com login, perfil e contrato no mesmo formulário. Eliminar o "desvio" para a tela de "Funcionários — Contratos de trabalho" após salvar/editar, e expor as credenciais existentes na aba **Login e Perfil** do perfil de cada funcionário.

## O que muda

### 1. Cadastro/edição vive em **Equipe → Funcionários**

- O botão **+ Novo** da página `Equipe` (quando "Funcionário" é escolhido) e o ícone de lápis na linha do funcionário passam a abrir o **mesmo dialog** de cadastro/edição (Dados pessoais + Contrato + Login) — sem navegar para outra rota.
- Esse dialog é o que hoje já existe em `hr-contratos.tsx` (campos: nome, CPF, sexo, cargo, setor, regime, salário, admissão, demissão, status, e bloco "Criar login" com e-mail/senha/perfil). Vamos **extraí-lo** para um componente reutilizável `FuncionarioFormDialog` e usá-lo em `Equipe`.
- Ao salvar (criar ou editar), o dialog fecha e a lista de **Equipe → Funcionários** é recarregada. **Não há redirecionamento** para `/app/hr-contratos`.

### 2. Página `/app/hr-contratos` deixa de ser ponto de cadastro

- Removemos os botões "+ Novo" e o lápis dessa página, além do tratamento de `?new=1` / `?edit={userId}` que abre o dialog automaticamente.
- A página continua existindo como **relatório/listagem técnica** dos contratos de trabalho da clínica (somente leitura), acessível pelo menu de RH para quem quiser ver a tabela completa. O bloco "Sexo" e a lógica de criação de login passam a viver apenas dentro do `FuncionarioFormDialog`.
- (Opcional, se preferir, podemos remover o item de menu — me diga depois; por padrão mantenho como leitura.)

### 3. Aba **Login e Perfil** no perfil do funcionário

Em `/app/funcionario/{userId}` (arquivo `app.funcionario.$userId.tsx`), adicionamos uma nova aba **Login e Perfil** ao lado de Contratos / Ponto / Férias / Holerites, mostrando:

- **Nome**, **telefone**, **sexo** (do `profiles`/`hr_contratos`)
- **E-mail de login** (consultado via server function que lê `auth.users` com `supabaseAdmin` e cruza com `user_id`) — somente leitura, exibido como "login@dominio.com"
- **Perfil de acesso** (papel atual em `clinica_memberships.role` para a clínica corrente: recepção, financeiro, gestor, etc.)
- **Status** (ativo/inativo) e botão **Editar** que abre o mesmo `FuncionarioFormDialog`.

Os funcionários já cadastrados anteriormente (com login criado) aparecem naturalmente — só estamos exibindo dados que já existem.

### 4. Após salvar → volta para Equipe → Funcionários

- O dialog fecha sobre a página de Equipe; a tabela de funcionários é atualizada inline. Nada mais redireciona para `hr-contratos`.

## Detalhes técnicos

- **Novo componente**: `src/components/funcionarios/FuncionarioFormDialog.tsx` — recebe `open`, `onOpenChange`, `clinicaId`, `editingUserId?` e `onSaved()`. Contém toda a lógica de criação de login (`supabase.auth.admin.createUser` via server fn já existente) + upsert em `profiles` + insert/update em `hr_contratos`.
- **`app.equipe.tsx`**: substitui o `Link to="/app/hr-contratos" search={{edit: f.user_id}}` por um botão que abre o dialog; o callback "Funcionário" do chooser também abre o dialog (em vez de navegar).
- **`app.hr-contratos.tsx`**: remove imports `Dialog`/form/state de cadastro, remove `validateSearch` de `new`/`edit`, remove botão "+ Novo" e o lápis. Mantém apenas a tabela de contratos (visualização).
- **`app.funcionario.$userId.tsx`**: adiciona `<TabsTrigger value="login">Login e Perfil</TabsTrigger>` e o conteúdo correspondente. Para ler o e-mail de outro usuário, criamos `getFuncionarioLogin` em `src/lib/funcionarios.functions.ts` (server fn protegida que valida que o solicitante é gestor da mesma clínica, então usa `supabaseAdmin.auth.admin.getUserById`).
- **Sem mudanças de schema** — todos os dados (sexo, perfil, login) já existem nas tabelas atuais.

## Fora de escopo

- Reset de senha / troca de e-mail do funcionário (podemos adicionar depois, se quiser).
- Reorganizar o menu lateral de RH.
