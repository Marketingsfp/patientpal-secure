# Unificar telas de Médicos

Hoje existem duas entradas em **Cadastros → Médicos** apontando para páginas diferentes que editam o **mesmo registro** via `MedicoFormDialog`:

- `/app/equipe` — lista com status ativo/inativo, especialidades, telefone e detecção de "cadastro pendente" (perfil médico sem CRM).
- `/app/medicos` — lista simples com coluna **Repasse** (via RPC `medicos_repasse_lista`, restrita a gestor) e botão **Exportar Excel**.

O financeiro **não depende de nenhuma das duas telas** — ele lê os campos de repasse direto da tabela `medicos` em `src/lib/repasse-calc.ts`. Portanto a unificação é puramente de UX.

## O que será feito

**Escopo:** aplicar em **todas as clínicas** (dedup técnica de tela, sem mudança de regra de negócio). Confirmar antes de executar.

### 1. Consolidar tudo em `/app/equipe`

Na tabela de `src/routes/_authenticated/app.equipe.index.tsx`:

- Adicionar coluna **Repasse** (à direita de Especialidade), populada pela mesma RPC `medicos_repasse_lista` usada hoje em `/app/medicos`. A RPC já é restrita — quem não for gestor simplesmente vê "—" (comportamento atual da outra tela).
- Adicionar botão **Exportar Excel** no topo (ao lado de "Novo médico"), reaproveitando `exportToExcel` de `src/lib/export-csv.ts` com as colunas: Nome, CRM, Especialidades, Telefone, Repasse, Status.
- Linhas "cadastro pendente" continuam aparecendo com "—" nas colunas de CRM/Repasse (já é o padrão).

### 2. Aposentar `/app/medicos`

- Trocar o corpo de `src/routes/_authenticated/app.medicos.tsx` por um `<Navigate to="/app/equipe" replace />` para não quebrar:
  - links antigos salvos por usuários;
  - `useUniversalSearch` (`/app/medicos?abrir=<id>` — trocar por `/app/equipe?abrir=<id>` e tratar o param na equipe para abrir o dialog);
  - o atalho de "rateio/repasse" no `app-shell` (linha 337) — repontar para `/app/equipe`.
- Manter o arquivo como redirect (não deletar a rota) por 1 ciclo, para não invalidar bookmarks.

### 3. Atualizar navegação e permissões

- `src/components/app-shell.tsx`:
  - Remover o item duplicado `{ to: "/app/medicos", label: "Médicos" }` do grupo Cadastros (linha 176).
  - Repointar o atalho `"/app/medicos"` do bloco `/rateio|repasse/` (linha 337) para `/app/equipe`.
- `src/components/list-shell/command-palette.tsx`: remover a entrada `mk("Médicos", "/app/medicos")` (linha 157), já existe a de `/app/equipe`.
- `src/lib/permissoes-rotas.ts`: manter o mapeamento `"/app/medicos" → "medicos"` (para o redirect não perder permissão) e garantir que `/app/equipe` também mapeia para `"medicos"` (verificar; caso não, adicionar).
- `src/hooks/use-universal-search.ts`: trocar `/app/medicos?abrir=…` por `/app/equipe?abrir=…`.

### 4. Suporte a `?abrir=<id>` em `/app/equipe`

Adicionar `validateSearch` para aceitar `abrir` (id do médico) e, no primeiro render, abrir o `MedicoFormDialog` correspondente — replicando o comportamento antigo de `/app/medicos?abrir=…` que a busca universal usa.

## Fora de escopo

- Nenhuma mudança em `MedicoFormDialog`, `repasse-calc.ts`, RPC `medicos_repasse_lista`, ou em qualquer cálculo/lançamento do financeiro.
- Nenhuma mudança em `/app/medico/$medicoId` (detalhe/edição via página cheia — segue existindo e continua acessível pelo botão de editar).

## Validação

- Abrir `/app/equipe` como admin: coluna Repasse preenchida + botão Exportar Excel gera arquivo com as 6 colunas.
- Abrir `/app/equipe` como perfil não-gestor: Repasse aparece "—" (RPC retorna vazio).
- Acessar `/app/medicos`: redireciona para `/app/equipe`.
- Buscar um médico na busca universal e clicar no resultado: abre o dialog dentro de `/app/equipe`.
- Menu lateral em Cadastros: apenas **uma** entrada "Médicos".

## Perguntas antes de executar

1. Aplicar em **todas as clínicas** ou só em uma específica?
2. Manter URL canônica em **`/app/equipe`** (com `/app/medicos` como redirect), ou prefere que a URL canônica seja `/app/medicos`?
