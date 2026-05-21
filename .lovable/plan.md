# Edição de médico em pop-up + Login/Perfil padronizado

## Problema

1. Na aba **Médicos** de `/app/equipe`, o lápis ainda leva o usuário para outra tela (`/app/medicos?edit=...`) que então abre o diálogo. O usuário quer que o lápis abra direto um pop-up de edição **na própria página de Equipe**, idêntico ao comportamento de Funcionário.
2. A aba **Acesso** do médico só mostra "Criar login" — diferente do funcionário, que ao editar mostra o e-mail de login atual e um botão "Trocar senha".

## Solução

Extrair o formulário gigante de médico (hoje inline em `app.medicos.tsx`, ~400 linhas) para um componente reutilizável `MedicoFormDialog`, espelhando o `FuncionarioFormDialog`. Usar esse componente tanto em `/app/medicos` quanto em `/app/equipe`. Padronizar a aba de acesso.

## Passos

### 1. Criar `src/components/medicos/MedicoFormDialog.tsx`

Props: `{ open, onOpenChange, clinicaId, editingMedicoId?: string | null, onSaved? }`.

- Mover todo o estado e a UI das abas atuais (Dados / Especialidades / Contato / Endereço / Banco / Repasse / Acesso) do `app.medicos.tsx` para dentro deste componente.
- Mover `openEdit`/`resetForm`/`handleSubmit`/`toggleEsp` para dentro do componente. Buscar o médico por `editingMedicoId` em um `useEffect` (similar ao que `FuncionarioFormDialog` faz com `editingUserId`).
- Manter a criação automática de paciente e a criação de usuário do sistema exatamente como hoje.

### 2. Aba **Acesso** com mesma dinâmica do funcionário

Quando `editingMedicoId` está presente E o registro `medicos` tem `user_id`:
- Buscar o e-mail via `getFuncionarioLogin({ clinicaId, userId: medico.user_id })` (função já existe e é genérica).
- Exibir: `E-mail de login: <email>` + botão **Trocar senha** que abre os campos `Nova senha` / `Confirmar senha` e chama `definirSenhaFuncionario` (também genérica) com confirmação e toasts — mesmo layout do `FuncionarioFormDialog` (linhas 271–308).
- Esconder o bloco "Criar login de acesso ao sistema" neste caso.

Quando editando médico sem `user_id` (ou novo médico): manter o bloco atual "Criar login de acesso ao sistema" (checkbox + e-mail + senha + perfil).

Nenhuma função nova de servidor é necessária — `getFuncionarioLogin` e `definirSenhaFuncionario` já operam por `userId` arbitrário e validam permissão por `assertManager(clinicaId)`.

### 3. Refatorar `src/routes/_authenticated/app.medicos.tsx`

- Remover toda a UI do dialog inline e o estado de formulário; apenas manter listagem, busca, exportação e o botão "Novo médico".
- Estado local: `medicoDialog: { open: boolean; id: string | null }`.
- "Novo médico" → `setMedicoDialog({ open: true, id: null })`.
- Lápis da tabela → `setMedicoDialog({ open: true, id: m.id })`.
- Renderizar `<MedicoFormDialog open={...} editingMedicoId={...} onSaved={load} />`.
- Manter `validateSearch` com `new`/`edit` e os dois `useEffect` que sincronizam URL → estado local (continua funcionando para deep-links).

### 4. Atualizar `src/routes/_authenticated/app.equipe.tsx`

- Adicionar estado `medicoDialog: { open, id }` e importar `MedicoFormDialog`.
- Substituir o link do lápis (linha 203–205) por:
  ```tsx
  <Button size="icon" variant="ghost" onClick={() => setMedicoDialog({ open: true, id: m.id })}>
    <Pencil className="h-4 w-4" />
  </Button>
  ```
- Alterar `escolherMedico` (linha 90) para abrir o diálogo localmente: `setMedicoDialog({ open: true, id: null })` em vez de navegar para `/app/medicos?new=1`.
- Renderizar `<MedicoFormDialog>` ao lado do `<FuncionarioFormDialog>` no fim do JSX, com `onSaved={() => setReloadKey(k => k + 1)}`.

## Arquivos afetados

- **novo**: `src/components/medicos/MedicoFormDialog.tsx`
- **edit**: `src/routes/_authenticated/app.medicos.tsx` (remove dialog inline, usa componente)
- **edit**: `src/routes/_authenticated/app.equipe.tsx` (pop-up local em vez de navegação)

## Fora de escopo

- Alterar o e-mail de login do médico (continua sendo só leitura, mesmo padrão do funcionário).
- Mexer em RLS, criação de paciente automático ou regras de repasse.
- Criar funções de servidor novas — as do equipe.functions.ts já servem.
