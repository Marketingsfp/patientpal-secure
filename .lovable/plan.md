## Objetivo

Transformar a edição de cliente em uma página dedicada (em vez do pop-up atual), acessada pelo ícone de lápis na listagem `/app/clientes`. A criação de novo cliente continua no diálogo atual (não foi solicitada mudança).

## Mudanças

### 1. Nova rota `/app/clientes/$pacienteId/editar`
Arquivo: `src/routes/_authenticated/app.clientes.$pacienteId.editar.tsx`

- Carrega os dados do paciente pelo `pacienteId` da URL via `supabase.from("pacientes").select(...).eq("id", ...).single()`.
- Renderiza o mesmo formulário hoje existente no diálogo (abas Dados / Endereço / Responsável, foto, busca por CEP, ditado por voz, validações de CPF, sugestão de responsável por idade).
- Botão **"Voltar"** no topo (ícone `ArrowLeft`) que faz `navigate({ to: "/app/clientes" })` preservando o `?q=` da busca anterior se houver (via `search` param).
- Botões "Cancelar" / "Salvar" no rodapé; após salvar com sucesso, volta para a listagem.
- Cabeçalho com o nome do paciente e título "Editar cliente".

### 2. Extrair o formulário para componente reutilizável
Arquivo novo: `src/components/clientes/cliente-form.tsx`

- Move toda a UI/lógica do form (abas, foto, voz, CEP, responsável, submit) hoje embutida em `app.clientes.tsx` para esse componente.
- Props: `clinicaId`, `paciente` (existente para editar, ou `null` para novo), `onSaved(pacienteId)`, `onCancel`.
- Reutilizado tanto pela nova rota de edição quanto pelo diálogo de "Novo cliente" que permanece na listagem.

### 3. Ajustes em `src/routes/_authenticated/app.clientes.tsx`
- Botão do lápis muda de `onClick={() => openEdit(p)}` para `<Link to="/app/clientes/$pacienteId/editar" params={{ pacienteId: p.id }}>` (mantendo o estilo de botão ghost).
- Remove o estado `editing`, `openEdit`, e toda a lógica/JSX do diálogo de edição.
- Mantém apenas o diálogo de **Novo cliente** (botão "+ Novo cliente"), agora usando `<ClienteForm />` internamente.
- Mantém intactos os outros diálogos (biometria, consentimento LGPD, prontuário, câmera).

## Detalhes técnicos

- Filename ↔ rota: `app.clientes.$pacienteId.editar.tsx` → `createFileRoute("/_authenticated/app/clientes/$pacienteId/editar")`.
- Acesso ao param: `const { pacienteId } = Route.useParams()`.
- Loader opcional via TanStack Query; para minimizar mudanças, fazer fetch dentro do componente via `useEffect` + `supabase` (padrão usado em `app.clientes.tsx`).
- Estados de loading e "paciente não encontrado" tratados com mensagens simples.
- Não alterar lógica de negócio (payload de update, upload de foto, etc.) — só reorganização de UI.

## Fora do escopo
- Não muda o fluxo de "Novo cliente" (continua em diálogo).
- Não muda os outros ícones da linha (biometria, prontuário, excluir).
