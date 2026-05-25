## Plano: novos submenus "Convênio" e "Benefícios" em Cartão Benefícios

### Objetivo
Criar dois novos submenus dentro de "Cartão Benefícios":
- **Convênio**: lista os tipos de cartão benefícios (ex.: Família, Individual, Premium…).
- **Benefícios**: lista os benefícios oferecidos, cada um vinculado a um Convênio.

Ambos com CRUD completo (criar, editar, excluir, listar), por clínica, com RLS.

### Estrutura no app

Novos itens na sidebar dentro do grupo "Cartão Benefícios":

```text
Cartão Benefícios
  ├ Nova venda
  ├ Modelo de contrato
  ├ Convênio          ← NOVO
  ├ Benefícios        ← NOVO
  └ Relatórios
```

Novas rotas (file-based routing):
- `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx`
- `src/routes/_authenticated/app.cartao-beneficios.beneficios.tsx`

Cada uma terá sua aba ativa exclusiva no layout `app.cartao-beneficios.tsx` (mesmo padrão das demais).

### Banco de dados (migration)

Duas tabelas novas, isoladas das tabelas atuais (`planos_assinatura`, `contratos_assinatura`), para não impactar fluxos existentes:

- **cb_convenios**: `clinica_id`, `nome`, `descricao`, `ativo`
- **cb_beneficios**: `clinica_id`, `convenio_id` (FK para cb_convenios), `nome`, `descricao`, `ativo`

Regras de acesso (RLS):
- Apenas membros ativos da clínica conseguem ver/criar/editar/excluir registros da sua clínica.
- Gestores/admins têm permissão para administrar.

Triggers padrão: `updated_at` automático.

### Telas

**Convênio** (`/app/cartao-beneficios/convenios`)
- Tabela com colunas: Nome, Descrição, Status (Ativo/Inativo), ações (Editar / Excluir).
- Botão "Novo convênio" abre dialog com: nome, descrição, ativo.

**Benefícios** (`/app/cartao-beneficios/beneficios`)
- Tabela com colunas: Nome, Convênio, Descrição, Status, ações.
- Filtro por Convênio no topo.
- Botão "Novo benefício" abre dialog com: nome, convênio (select), descrição, ativo.
- Validação: não permite criar benefício se não houver nenhum convênio cadastrado (com link para cadastrar).

### Detalhes técnicos

- Padrão visual idêntico às telas existentes (`Card`, `Table`, `Dialog`, `Button` shadcn).
- Consultas via `supabase` client (browser), respeitando RLS por `clinica_id` do `useClinica()`.
- Ícones na sidebar: `ShieldCheck` (Convênio) e `Gift` (Benefícios), lucide-react.
- Sem alterações nas tabelas/fluxos atuais de contratos e modelos.

### Arquivos afetados
- **Novo**: `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx`
- **Novo**: `src/routes/_authenticated/app.cartao-beneficios.beneficios.tsx`
- **Editar**: `src/routes/_authenticated/app.cartao-beneficios.tsx` (adicionar abas)
- **Editar**: `src/components/app-shell.tsx` (adicionar itens no grupo "Cartão Benefícios")
- **Migration**: criar tabelas `cb_convenios` e `cb_beneficios` com RLS e triggers
