## Objetivo

Separar o cadastro de funcionário em dois subsistemas, mantendo-os interligados pelo mesmo registro em `hr_contratos`.

- **Gestão de Pessoas → Funcionários**: dono do cadastro completo (todos os campos da aba "Dados"). Sem "Login e perfil".
- **Recepção → Equipe → Funcionários**: apenas vincula um funcionário já cadastrado a um perfil de acesso. Mostra somente Nome (dropdown), Setor e Status, e mantém a aba "Login e perfil".

## Fluxo final

1. Usuário vai em **Gestão de Pessoas → Gestão → Funcionários** e cadastra o funcionário (nome, CPF, cargo, setor, salário, admissão, etc.).
2. Depois vai em **Recepção → Cadastros → Equipe → Funcionários**, clica em "Novo cadastro", escolhe no dropdown um funcionário já existente (vindos da lista de Gestão de Pessoas que ainda não têm login) e preenche Setor + Status + aba "Login e perfil" (e-mail/senha/perfil).
3. Ao salvar em Recepção, o `user_id` do login criado é gravado no mesmo `hr_contratos`, ligando os dois.

## Mudanças

### 1. Página `src/routes/_authenticated/app.funcionarios.tsx` (Gestão de Pessoas)
Substituir o placeholder por uma listagem + diálogo de cadastro:
- Listagem dos `hr_contratos` da clínica (nome, cargo, setor, status, vinculado/não vinculado a login).
- Botão "Novo funcionário" abre um novo diálogo `FuncionarioDadosDialog` (criado abaixo) com apenas a aba "Dados".
- Botão de editar reabre o mesmo diálogo para o registro.

### 2. Novo `src/components/funcionarios/FuncionarioDadosDialog.tsx`
- Cópia enxuta do atual `FuncionarioFormDialog` contendo **somente** os campos de Dados (nome, CPF, sexo, regime, cargo, setor, carga, salário, admissão, demissão, status).
- Sem aba/tabs, sem qualquer referência a login, perfil, e-mail, senha, ou `cadastrarUsuario`.
- Insere/atualiza em `hr_contratos` sem `user_id`.

### 3. Atualizar `src/components/funcionarios/FuncionarioFormDialog.tsx` (usado em Recepção)
- Aba "Dados" passa a mostrar apenas três campos:
  - **Nome do funcionário** → vira um `Select` (dropdown) carregado de `hr_contratos` da clínica onde `user_id IS NULL` (funcionários ainda sem login). No modo de edição, o select fica **bloqueado** exibindo o nome atual.
  - **Setor** (atualiza `setor_id` no `hr_contratos` vinculado).
  - **Status** (atualiza `status` no `hr_contratos` vinculado).
- Manter integralmente a aba "Login e perfil" (criar login, trocar senha, perfil, e-mail) como hoje.
- Ao salvar um cadastro novo: cria o login (se marcado) e faz `UPDATE` em `hr_contratos` setando `user_id`, `setor_id` e `status` no registro escolhido (em vez de `INSERT`).
- Ao editar: localiza o `hr_contratos` pelo `user_id` atual e atualiza só setor/status (já é o comportamento atual).
- Remover do componente os estados/inputs não usados nessa tela (CPF, sexo, regime, cargo, carga, salário, admissão, demissão).

### 4. Sem mudanças de banco
A tabela `hr_contratos` já tem `user_id` opcional (registros são criados sem login em Gestão de Pessoas e ganham `user_id` quando vinculados em Recepção). Nenhuma migration necessária.

## Detalhes técnicos

- O novo diálogo de Gestão de Pessoas faz `INSERT`/`UPDATE` direto em `public.hr_contratos` via `supabase` browser client (RLS já existente cobre).
- O dropdown em Recepção consulta:
  `select id, funcionario_nome, setor_id, status from hr_contratos where clinica_id = ? and user_id is null order by funcionario_nome`.
- Ao escolher um funcionário no dropdown, o form pré-popula Setor/Status com os valores atuais do `hr_contratos` (o usuário pode alterar antes de salvar).
- O `setSubsystem`/menu não muda — "Funcionários" em Gestão de Pessoas já existe e Equipe (Recepção) continua igual.
