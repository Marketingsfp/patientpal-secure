## Contexto

Hoje existem dois cadastros parecidos no menu **Cadastros**:

- **Clínicas** (`/app/clinicas`) — cadastra a entidade jurídica (nome, CNPJ, cidade/UF, telefone) e cria membership de admin via RPC `criar_clinica_com_admin`. É o registro "raiz" usado pelo seletor de clínica.
- **Unidades** (`/app/unidades`) — cadastra unidades físicas vinculadas à clínica atual (endereço completo, CEP, geolocalização e raio em metros para bater ponto, status ativa/inativa).

Funcionalmente são coisas diferentes (uma é a pessoa jurídica + membership, a outra são endereços operacionais), mas para o usuário aparecem como "dois cadastros de unidades". A decisão é unificar tudo sob **Unidades**.

## Plano

### 1. Página unificada em `/app/unidades`

Reescrever `src/routes/_authenticated/app.unidades.tsx` para ter duas abas (`Tabs` do shadcn):

- **Aba "Clínicas"** — lista de `memberships` (igual ao que `app.clinicas.tsx` já faz hoje): cards com nome, cidade/UF, role, botões **Selecionar** e **Editar**, e botão **Nova clínica** no topo da aba. Reaproveita o mesmo `Dialog` e mesma lógica (RPC `criar_clinica_com_admin` para criar, `update` em `clinicas` para editar; chama `refresh()` e `setClinicaAtual()` do `useClinica`).
- **Aba "Unidades físicas"** — tabela atual de unidades da clínica selecionada (endereço, geolocalização, raio, ativa/inativa), com o mesmo `Dialog` de criar/editar já existente.

Header da página passa a ser **Unidades** com subtítulo explicando que ali ficam tanto as clínicas (entidade) quanto as unidades físicas de cada clínica.

### 2. Remoção do item "Clínicas" do menu

Em `src/components/app-shell.tsx`:

- Remover a entrada `{ to: "/app/clinicas", label: "Clínicas", ... }` da seção **Cadastros**.
- Manter apenas `{ to: "/app/unidades", label: "Unidades", ... }`.
- Ajustar o atalho do PendenciasAlert na linha ~216 (`/cl[ií]nica/.test(t) ? "/app/clinicas"`) para apontar para `/app/unidades`.

### 3. Rota antiga

`src/routes/_authenticated/app.clinicas.tsx` passa a redirecionar para `/app/unidades` (via `beforeLoad` com `throw redirect({ to: "/app/unidades" })`), para não quebrar links existentes (ex.: o botão "Criar minha primeira clínica" em `app.index.tsx` e qualquer bookmark).

Alternativamente o arquivo pode ser deletado; manter como redirect é mais seguro porque há referências no código a `/app/clinicas`.

## Detalhes técnicos

- Sem mudanças de banco, RLS ou server functions. Apenas:
  - `src/routes/_authenticated/app.unidades.tsx` — refatorado com `Tabs` reunindo as duas UIs.
  - `src/routes/_authenticated/app.clinicas.tsx` — vira redirect para `/app/unidades`.
  - `src/components/app-shell.tsx` — remove item "Clínicas" e atualiza o atalho do PendenciasAlert.
  - `src/routes/_authenticated/app.index.tsx` — atualiza o `<Link to="/app/clinicas">` para `/app/unidades`.
- A aba padrão ao abrir `/app/unidades` será **Clínicas** quando o usuário ainda não tiver nenhuma unidade física cadastrada (ou nenhuma clínica), e **Unidades físicas** caso contrário.
