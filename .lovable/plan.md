## Diagnóstico

Hoje, a tela **Perfis de Acesso** (`/app/perfis`) grava permissões por módulo em `perfil_permissoes` (níveis `none` / `read` / `write`), mas essa configuração só é usada para **esconder itens do menu lateral** (`app-shell.tsx` via `usePermissoes`).

Nada bloqueia o acesso direto à rota. Por isso, quando o admin marca "Agenda = none" para o perfil MÉDICO, o item some do menu, mas o médico ainda consegue abrir `/app/agenda` digitando a URL ou por links internos (comprovantes, notificações, atalhos). Também não há distinção entre `read` e `write` dentro das telas — quem tem `read` vê os botões de editar/criar/excluir.

Além disso, o mapa `ROUTE_TO_MODULE` (rota → chave de módulo) vive só dentro de `app-shell.tsx` e está incompleto (várias rotas de `_authenticated/` não têm chave associada, então nem o menu nem um guard futuro conseguem avaliá-las).

## Objetivo

Fazer a aba **Perfis / Permissões** ser a **fonte única de verdade** para:

1. O que aparece no menu.
2. O que pode ser aberto (rota).
3. O que pode ser **editado** dentro da tela (botões de criar/salvar/excluir).

## Plano

### 1. Centralizar o mapa Rota → Módulo

- Criar `src/lib/permissoes-rotas.ts` exportando `ROUTE_TO_MODULE` e um helper `moduloDaRota(pathname)` que trata rotas com parâmetros (`/app/clientes/$id/editar` → `clientes`, `/app/atendimento-ia/$agendamentoId` → `atendimento-ia`, etc.).
- Mover o mapa que hoje está em `app-shell.tsx` para esse arquivo e importar de lá.
- Preencher as rotas hoje ausentes (`app.backups`, `app.equipe.*.editar`, `app.atendimento-ia.*`, `app.cartao-beneficios.*`, `app.clientes.*`, `app.agenda-v2`, `app.dev-*`, `app.hr-*`, `app.lms-admin`, `app.treinamentos`, `app.mkt-*`, `app.senhas`, etc.). Rotas de sistema/pessoais (`perfil-proprio`, dev shells) marcadas como públicas dentro do app.

### 2. Guard de rota por módulo

Como o layout `_authenticated/route.tsx` é `ssr:false` e gerenciado pela integração, o guard será **client-side** dentro do `AppShell`:

- Estender `usePermissoes` para também expor o **nível** (`Map<modulo, "read"|"write">`), não só o `Set` de permitidos.
- No `AppShell`, ao renderizar `<Outlet />`, calcular o módulo da rota atual via `moduloDaRota(location.pathname)`. Se o usuário **não é admin** e o módulo não está permitido, renderizar uma tela **"Acesso negado"** (novo componente `<SemPermissao modulo=... />`) no lugar do `<Outlet />`, com um botão para voltar ao Dashboard.
- Enquanto `loading` do `usePermissoes` estiver `true`, mostrar um esqueleto para não piscar "Acesso negado" na primeira renderização.
- Rotas de sistema (perfil próprio, tela de "sem permissão", raiz `/app`) ficam sempre liberadas.

### 3. Diferenciar `read` de `write` dentro das telas

- Criar hook `useAcessoModulo(modulo): "none" | "read" | "write"` a partir do mesmo estado do `usePermissoes`. `admin` retorna sempre `"write"`.
- Criar `<SomenteEscrita modulo="agenda">…</SomenteEscrita>` (e um helper `podeEscrever(modulo)`) para envolver botões de criar/editar/excluir/salvar nas telas mais sensíveis desta primeira leva:
  - Agenda (novo agendamento, editar, cancelar).
  - Clientes (novo, editar, excluir).
  - Financeiro (novo lançamento, aprovar estorno, editar categorias).
  - Caixa (abertura/fechamento — mantido, e "Solicitar estorno" fica só se `write`).
  - Cadastros: Perfis, Equipe, Cargos, Unidades, Médicos, Procedimentos, Planos, Serviços/Especialidades, Modelos de Prontuário/Documentos.
  - Prontuários e Anamneses (salvar / assinar).
- Demais telas ficam para uma segunda leva depois desta base funcionar; hoje elas continuam com o comportamento atual dentro da tela, mas o **acesso à rota já é bloqueado** pela etapa 2.

### 4. Cobertura de RLS (banco)

- Para as tabelas mais críticas (`agendamentos`, `pacientes`, `prontuarios`, `fin_lancamentos`, `caixa_movimentos`), auditar as políticas RLS e, quando fizer sentido, apertar as políticas de `SELECT`/`UPDATE`/`INSERT` para usar um helper `has_modulo_acesso(uuid, text, text)` (SECURITY DEFINER) que lê `perfis_acesso` + `perfil_permissoes`. Isso garante que, mesmo se alguém chamar direto a API, o banco recusa. Esta etapa entra como migração separada, aplicada por módulo, começando por `agendamentos` (o exemplo dado). As demais viram tickets subsequentes para evitar uma migração enorme.

### 5. Ajustes na tela Perfis

- Botão "Aplicar todos" e switches por grupo já existem — manter.
- Adicionar aviso visível quando o admin marca `read` num módulo cuja tela ainda não diferencia read/write, para deixar claro que "hoje esse módulo só respeita liberado/bloqueado".
- Mostrar uma coluna extra "Rotas cobertas" (opcional, informativo) para o admin saber quais URLs cada módulo controla.

### 6. Auditoria de presets

- Revisar `src/lib/permissoes-presets.ts` para refletir o pedido (ex.: MÉDICO **sem** agenda por padrão? confirmar em seguida). Os presets só valem antes do admin salvar a primeira configuração — depois disso, o que manda é o banco.

## Detalhes técnicos

- Fonte de verdade em runtime: `perfil_permissoes` (via `usePermissoes`). Presets em `permissoes-presets.ts` só como fallback inicial.
- `usePermissoes` passa a devolver `{ allowed: Set<string> | null; nivel: Map<string, "read"|"write"> | null; loading }`. `null` = admin/carregando.
- `AppShell` já filtra o menu com `leafAllowed`; passará a filtrar também o `<Outlet />` com o mesmo `Set`.
- Componente `SemPermissao`: card centralizado com ícone de cadeado, nome do módulo, mensagem "Fale com o administrador da clínica" e botão "Voltar ao início" (`navigate({ to: "/app" })`).
- Nenhuma mudança em `src/routes/_authenticated/route.tsx` (arquivo gerenciado pela integração).
- Nenhuma alteração em edge functions.

## Ordem de execução (uma etapa por vez, cada uma verificável)

1. Extrair `ROUTE_TO_MODULE` para arquivo compartilhado e completar as rotas faltantes.
2. Estender `usePermissoes` + criar `useAcessoModulo` + criar componente `SemPermissao`.
3. Aplicar guard no `AppShell` (bloqueio de rota).
4. Aplicar `podeEscrever` nas telas prioritárias (Agenda, Clientes, Financeiro, Caixa, Cadastros críticos, Prontuários).
5. Revisar presets e ajustar textos da tela Perfis.
6. (Opcional / próximo ciclo) Migração de RLS para `agendamentos` usando `has_modulo_acesso`.

## Perguntas rápidas antes de codar

- Quando um perfil tiver `read` num módulo que ainda não diferencia leitura/escrita, prefere **bloquear totalmente** (tratar `read` como `none` por enquanto) ou **liberar como está hoje**? Sugiro liberar como está hoje e ir migrando tela a tela — evita "quebrar" o que já funciona.
- Confirma que o preset padrão do MÉDICO deve ficar **sem agenda** (só prontuário/atendimento/consulta rápida)? Ou mantemos agenda no preset e a clínica remove pela tela de Perfis quando quiser?
