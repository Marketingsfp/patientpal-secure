## 1. Aba "Login e perfil" — mostrar e-mail real + trocar senha

No `FuncionarioFormDialog.tsx`, ao editar um funcionário com login:

- **Buscar o e-mail real** via `getFuncionarioLogin({ clinicaId, userId })` (server fn já existe, usa `supabaseAdmin`) em vez do atual `supabase.auth.getUser()`, que só retorna o usuário logado.
- **Exibir o e-mail** ("E-mail de login: fulano@x.com") sempre que o funcionário tiver `user_id`.
- **Botão "Trocar senha"** abaixo do e-mail: ao clicar, mostra dois campos (nova senha + confirmar) e um botão "Salvar nova senha" que chama uma nova server fn `definirSenhaFuncionario({ clinicaId, userId, novaSenha })`.
  - Server fn protegida por `requireSupabaseAuth` + `assertManager` (mesmo padrão de `getFuncionarioLogin`), usa `supabaseAdmin.auth.admin.updateUserById(userId, { password })`.
  - Validações: mínimo 6 caracteres, confirmação igual.
  - Toast de sucesso/erro; ao concluir, limpa os campos.
- Remover o texto "Para alterar e-mail ou senha use a tela de perfil do funcionário" (substituído pela ação inline).

## 2. Lápis de médico na aba Equipe → abrir edição do médico direto

Hoje, em `app.equipe.tsx` (linha ~204), o botão do lápis na aba Médicos é um `<Link to="/app/medicos">` sem parâmetro — leva para a listagem, sem abrir o dialog.

- **Adicionar suporte a `?edit=<medicoId>`** em `app.medicos.tsx`:
  - Estender `validateSearch` para aceitar `edit: string | undefined`.
  - Em um `useEffect`, quando `edit` chega e os médicos já carregaram, localizar o médico pelo id e chamar `openEdit(m)`; depois limpar a URL com `navigate({ search: {}, replace: true })`.
- **Atualizar o link na aba Médicos da Equipe** para `<Link to="/app/medicos" search={{ edit: m.id }}>`.

Resultado: clicar no lápis na aba Médicos da Equipe leva direto ao dialog de edição do médico, sem passar pela tela de funcionários nem pela listagem.

## Arquivos afetados

- `src/lib/equipe.functions.ts` — nova server fn `definirSenhaFuncionario`.
- `src/components/funcionarios/FuncionarioFormDialog.tsx` — aba "Login e perfil" carrega e-mail via server fn e ganha bloco de trocar senha.
- `src/routes/_authenticated/app.medicos.tsx` — `validateSearch` aceita `edit`, novo `useEffect` abre o dialog do médico.
- `src/routes/_authenticated/app.equipe.tsx` — link do lápis do médico passa `search={{ edit: m.id }}`.

## Fora do escopo

- Trocar e-mail de login (continua sendo via tela de perfil).
- Reset por e-mail (link "esqueci minha senha") — aqui é definição direta pelo gestor.