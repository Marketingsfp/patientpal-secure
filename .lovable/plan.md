## Objetivo

Separar a fila de atendimento da tela de atendimento em si. Hoje tudo vive em `app.atendimento-ia.tsx`. Vou dividir em duas rotas: a fila (lista) e o atendimento individual de um agendamento.

## Mudanças

### 1. Nova rota: `src/routes/_authenticated/app.atendimento-ia.$agendamentoId.tsx`
- Recebe o `agendamentoId` pela URL.
- Contém toda a parte de atendimento que hoje está dentro do bloco `{!agendamentoId ? ... : (...)}` em `app.atendimento-ia.tsx`: triagem, gravação/transcrição, SOAP, sugestões da IA, botão Salvar.
- Carrega o paciente/agendamento via Supabase usando o `agendamentoId` da URL (mesma lógica do `selecionar()` atual).
- Após salvar o prontuário com sucesso, em vez de limpar campos e continuar na mesma tela, exibe um estado de "Prontuário salvo" com um botão **"Voltar para fila de atendimento"** que navega para `/app/atendimento-ia`.
- Também mantém um link/botão discreto "Voltar para fila" no topo, para o caso de o médico desistir antes de salvar.

### 2. Ajustar `src/routes/_authenticated/app.atendimento-ia.tsx`
- Vira apenas a tela da fila (tabela de pacientes já implementada).
- Botão **Atender** deixa de chamar `selecionar(item)` e passa a navegar para `/app/atendimento-ia/$agendamentoId` usando `useNavigate` do TanStack Router.
- Remover todo o bloco de UI de atendimento (triagem, gravação, SOAP, salvar) e os estados/efeitos que só serviam para ele (`triagem`, transcrição, SOAP, sugestões, `handleSalvar`, etc.). Esses passam para a nova rota.
- Mantém: carregamento da fila, realtime da fila, badges de prioridade, filtros existentes.

### 3. Sem mudanças
- Banco de dados, RLS, permissões, lógica de IA, lógica de salvar prontuário (apenas muda o que acontece *depois* de salvar).
- Demais telas (agenda, financeiro, etc.).

## Detalhes técnicos

- Rota dinâmica com TanStack file-based routing: arquivo `app.atendimento-ia.$agendamentoId.tsx` → URL `/app/atendimento-ia/:agendamentoId`. Usar `createFileRoute("/_authenticated/app/atendimento-ia/$agendamentoId")` e `Route.useParams()` para pegar o id.
- Navegação no botão Atender: `navigate({ to: "/app/atendimento-ia/$agendamentoId", params: { agendamentoId: it.id } })`.
- Após salvar com sucesso (dentro do `handleSalvar`), trocar o `setLoading(null)` final por um `setSalvo(true)`; quando `salvo` for `true`, renderizar tela de confirmação com botão que faz `navigate({ to: "/app/atendimento-ia" })`.
- Manter `<Link>` no topo da nova rota para retorno antecipado.
