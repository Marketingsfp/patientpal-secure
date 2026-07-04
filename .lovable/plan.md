## Ajustes na aba "Regras de Preço" (Cartão Benefícios)

Arquivo único afetado: `src/components/cartao-beneficios/regras-tab.tsx`.

### 1. Reordenar colunas
Nova ordem: **Especialidade → Categoria → Serviço → Modo → Valor / % → …**
(Serviço deixa de ser a 1ª coluna e passa a ficar logo depois de Categoria.)
Aplicar tanto no `<TableHeader>` quanto em cada `<TableRow>` do corpo.

### 2. Corrigir busca do serviço "Preventivo" (e demais serviços que não aparecem)
Causa: o carregamento atual usa uma única query
```
supabase.from("procedimentos").select(...).eq("ativo", true).order("nome")
```
O PostgREST aplica `db-max-rows = 1000`, então clínicas com mais de 1.000 procedimentos ativos têm o restante cortado — o "Preventivo" cai fora desse teto e some do autocomplete, apesar de existir no cadastro.

Correção: paginar o fetch de `procedimentos` em blocos de 1000 (mesmo padrão já usado em `app.cartao-beneficios.beneficios.tsx`), acumulando todas as páginas até `page.length < PAGE`. Manter os filtros `clinica_id` + `ativo = true` e a ordenação por `nome`.

Nenhuma mudança de banco, de regras de negócio ou de outras telas.
