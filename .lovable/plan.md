## Diagnóstico

A pré-carga de `labProcIds` no diálogo de Novo Orçamento agora inclui **~4.470 procedimentos** (todos com `tipo_procedimento='laboratorio'` ou `grupo ILIKE '%labor%'`, união feita em memória). Ao pesquisar "glicose" em categoria Laboratório, a busca faz:

```
q.in("id", ids)  // ids.length ≈ 4470
```

O PostgREST recebe uma URL com ~165KB, muito acima do limite (nginx/Cloudflare rejeitam), então a request falha e o `data` volta vazio — nenhum exame de glicose aparece. É regressão da correção anterior: enquanto `procedimento_especialidades` tinha 18 linhas, o `in()` cabia; após adicionar a união com `tipo_procedimento`, estourou.

## Correção

Em `src/routes/_authenticated/app.orcamentos.tsx` (busca de procedimentos, linhas ~614–731):

1. **Remover o prefetch** `labProcIds` e o estado associado. Passa a ser desnecessário.
2. **Aplicar o filtro de categoria direto na query de busca** (PostgREST combina múltiplos `.or()` como AND):
   - Categoria `laboratorio`: `q.or("tipo_procedimento.eq.laboratorio,grupo.ilike.%labor%")`.
   - Categoria `demais`: `q.not("tipo_procedimento","eq","laboratorio").not("grupo","ilike","%labor%")` (registros com `grupo` nulo continuam aparecendo, pois `not ilike` inclui NULL como não-match).
3. **Manter o filtro de nome** como está (`.or("nome.ilike.%q%,nome.ilike.%norm%")`) — combinado com o `.or()` de categoria fica: `(nome match) AND (categoria match)`.
4. Remover o guard `if (categoria && labProcIds == null) return;` e a dependência `labProcIds` do `useEffect`.

Efeito: a busca passa a ser executada 100% no banco, sem prefetch nem lista gigante de IDs. Os 15 exames de glicose voltam a aparecer, e a busca fica mais rápida. Alinhado com a fonte de verdade usada pelo cadastro de Serviços.

## Fora do escopo

- Não mexer em `procedimento_especialidades` — o cadastro de Serviços grava a classificação em `tipo_procedimento`/`grupo`, então essa é a fonte usada.
- Não alterar nenhuma outra tela (agenda, caixa, atendimento).
