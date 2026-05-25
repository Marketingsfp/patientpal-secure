## Submenu "Tipo" em Serviços + renomear Procedimentos → Serviços

### 1. Estrutura do menu (`src/components/app-shell.tsx`)

Dentro de **Cadastros → Serviços**:
```
Serviços
├── Especialidades
├── Tipo            ← novo (CRUD)
└── Serviços        ← renomeado de "Procedimentos"
```

Mudanças:
- Adicionar entrada `{ to: "/app/tipos-servico", label: "Tipo", icon: Tags }`.
- Trocar `label: "Procedimentos"` por `label: "Serviços"` (rota `/app/procedimentos` continua a mesma — sem mudança de URL para não quebrar links/redirects).

### 2. Banco de dados — nova tabela `tipos_servico`

Criar via migration:
- Colunas: `id`, `clinica_id` (fk → clinicas), `nome` (text), `ativo` (bool, default true), `created_at`, `updated_at`.
- Unique `(clinica_id, lower(nome))` para evitar duplicatas.
- RLS: membros da clínica leem; quem tem permissão de cadastro escreve (mesmo padrão de `especialidades`).
- Trigger `update_updated_at_column`.
- Seed por clínica via trigger `AFTER INSERT ON clinicas` **e** seed inicial para todas as clínicas existentes: **Consulta, Exame, Procedimento, Cirurgia**.

### 3. Nova página `/app/tipos-servico`

Arquivo `src/routes/_authenticated/app.tipos-servico.tsx` — CRUD simples (lista + diálogo Novo/Editar + ativar/desativar + remover), reaproveitando o padrão do `app.especialidades.tsx`. Título da página: "Tipos de Serviço".

### 4. Página Serviços (atual `app.procedimentos.tsx`)

- Renomear título/header de "Procedimentos" para "Serviços" (na página em si — H1, meta title, breadcrumbs).
- Substituir o `Select` de Tipo (hoje hardcoded `consulta | exame | procedimento`) por uma lista dinâmica vinda de `tipos_servico` da clínica ativa.
- Manter `procedimentos.tipo` como `text` no banco (sem migração destrutiva) — o select grava o **nome** do tipo escolhido. `TIPO_LABEL`/`TIPO_COR` viram fallback genérico para tipos não conhecidos (cor neutra).
- Filtro "Todos os tipos" passa a listar os tipos dinâmicos da clínica.

### 5. Fora deste passo

- Não vou tocar em outras páginas que usam `tipo` (caixa, consulta-rápida, etc.) além do necessário para não quebrar. Os valores existentes (`consulta`/`exame`/`procedimento`) continuam válidos.
