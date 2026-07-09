## Diagnóstico

Na tela **Serviços** os 15 exames de glicose aparecem como "Laboratório" porque o cadastro usa a coluna `tipo_procedimento = 'laboratorio'` (e/ou `grupo = 'Laboratório'`) do próprio procedimento.

Já a busca de serviços dentro do orçamento (quando a categoria é "Laboratório") **filtra por uma fonte diferente**: a tabela de vínculos `procedimento_especialidades` — que na prática está quase vazia. Só **1 dos 15 exames de glicose** está vinculado por lá:

```
GLICOSE (BIOQUIMICA)                        →  sem vínculo
GLICOSE (URINA 24H)                         →  sem vínculo
GLICOSE 2H, BASAL, CURVA, SERUM, ...        →  sem vínculo
...
TESTE TOLERANCIA A GLICOSE                  →  LABORATORIO  ← único que aparece
```

Por isso o orçamento em modo Laboratório só mostra "TESTE TOLERANCIA A GLICOSE".

O `tipo_procedimento`/`grupo` está preenchido corretamente em todos os 15 — é a fonte que o cadastro respeita. O erro é o orçamento **ignorar** essa fonte.

---

## Correção

Ajustar o filtro de busca de serviços no diálogo **Novo Orçamento** (`src/routes/_authenticated/app.orcamentos.tsx`) para usar a mesma classificação que o cadastro:

- Categoria **Laboratório**: incluir procedimentos onde `tipo_procedimento = 'laboratorio'` **OU** cujo id esteja em `procedimento_especialidades` vinculado à especialidade LABORATORIO. União dos dois critérios, sem excluir nada.
- Categoria **Demais Serviços**: excluir esse mesmo conjunto (todos que não caem em Laboratório).

Implementação:

- Substituir o filtro atual (`q.in("id", labProcIds)` / `q.not("id","in", ...)`) por uma consulta que combine:
  1. IDs da união `procedimento_especialidades` **∪** `procedimentos.tipo_procedimento = 'laboratorio'`.
  2. Aplicar `.in("id", uniao)` para Laboratório ou `.not("id","in", uniao)` para Demais.
- Como o `useEffect` de carga inicial (linhas 615–631) só busca `procedimento_especialidades`, ele passará a buscar também os ids com `tipo_procedimento = 'laboratorio'` e fará a união em memória, guardando o `Set<string>` unificado em `labProcIds`.
- Nenhuma mudança na UI, nenhum backfill de dados, nenhuma migration. Após o ajuste, ao pesquisar "glicose" no orçamento (categoria Laboratório) aparecem os 15 exames.

Efeito colateral positivo: se no futuro cadastrarem novos exames com `tipo_procedimento = 'laboratorio'` (o padrão do cadastro), eles aparecerão automaticamente no orçamento sem precisar mexer em `procedimento_especialidades`.

---

## Fora do escopo

- Não vamos "backfillar" `procedimento_especialidades` — a fonte de verdade que o restante do sistema já usa é `tipo_procedimento`/`grupo`, e a UI de cadastro grava por lá.
- Não mexer no picker da agenda / atendimento múltiplo / caixa (o problema foi reportado só no Orçamento).
