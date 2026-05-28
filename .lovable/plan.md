## Objetivo

Trocar o clique do lápis (em Equipe → Funcionários e Médicos) por uma navegação para uma **página de edição em tela cheia**, no lugar do diálogo (pop-up) atual.

## O que muda

### 1. Extrair o corpo dos formulários (refactor)
Hoje, `FuncionarioFormDialog` e `MedicoFormDialog` misturam o `<Dialog>` com toda a lógica do formulário. Vou separar em dois componentes:

- `src/components/funcionarios/FuncionarioForm.tsx` — só o conteúdo do formulário (campos, tabs, ações, save).
- `src/components/medicos/MedicoForm.tsx` — idem para médico (incluindo tabs Dados, Especialidades, Serviços, Repasse).

Os `*FormDialog` atuais continuam existindo e passam apenas a embrulhar esses componentes em `<Dialog>`, para não quebrar o botão **"Novo cadastro"** (que continua como pop-up de criação rápida).

### 2. Novas rotas de edição em página inteira

- `src/routes/_authenticated/app.equipe.funcionario.$userId.editar.tsx`
  → renderiza `<FuncionarioForm editingUserId={userId} />` com header "Editar funcionário" e botão "Voltar" para `/app/equipe`.
- `src/routes/_authenticated/app.equipe.medico.$medicoId.editar.tsx`
  → renderiza `<MedicoForm editingMedicoId={medicoId} />` com header "Editar médico" e botão "Voltar" para `/app/equipe`.

Cada rota define seu próprio `head()` (title específico). Após salvar, volta para `/app/equipe` com a aba correta.

### 3. Ajuste no `app.equipe.tsx`

Os botões de lápis hoje chamam `setFuncDialog({ open: true, userId })` / `setMedicoDialog({ open: true, id })`. Vão passar a usar `<Link to="...">` (ou `useNavigate`) para as novas rotas. Os diálogos de edição não são mais montados na página — só fica o diálogo de "Novo cadastro".

A rota `/app/equipe` aceita um search param opcional `tab=funcionarios|medicos` para que, ao voltar da edição, a aba correta fique selecionada.

## O que NÃO muda

- O botão **"Novo cadastro"** continua abrindo o seletor + diálogo (pop-up) — só edição vira página. Se você preferir que "Novo" também vire página, me diga.
- As rotas existentes `/app/medico/$medicoId` e `/app/funcionario/$userId` (telas de **perfil** somente leitura, com agenda/contratos/etc.) continuam intocadas.
- Páginas `/app/medicos` e `/app/funcionarios` continuam usando os mesmos diálogos (sem mudança para esta tarefa).

## Resumo técnico

```text
src/components/funcionarios/
  FuncionarioForm.tsx        (novo — corpo extraído)
  FuncionarioFormDialog.tsx  (passa a usar FuncionarioForm)
src/components/medicos/
  MedicoForm.tsx             (novo — corpo extraído)
  MedicoFormDialog.tsx       (passa a usar MedicoForm)
src/routes/_authenticated/
  app.equipe.tsx                                  (pencil → navigate)
  app.equipe.funcionario.$userId.editar.tsx      (novo)
  app.equipe.medico.$medicoId.editar.tsx         (novo)
```