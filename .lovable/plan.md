## Objetivo
Ao criar/editar uma regra de benefício, quando o usuário escolher uma **Categoria** (campo `tipo` do procedimento), o dropdown "Serviço específico" deve mostrar apenas os serviços daquela categoria.

## Arquivo
- `src/components/cartao-beneficios/regras-tab.tsx`

## Mudanças

1. **Carregar `tipo` dos procedimentos** — no `load()` (linha ~102), incluir `tipo` no `select` de `procedimentos` e adicionar `tipo` no tipo `ProcOpt`.

2. **Filtrar `procOpts` por categoria selecionada** — trocar o `useMemo` atual (linhas 128–134) por uma função/memo que, dado o `r.tipo` atualmente selecionado no modal, filtre a lista:
   - Se `r.tipo` estiver definido → só procedimentos cujo `tipo` (case-insensitive) bate com ele.
   - Se `r.tipo` for null/"__any__" → lista completa (comportamento atual).
   
   Como `procOpts` hoje é global ao componente e o modal é filho, mover o filtro para o próprio modal: passar `procedimentos` (bruto) ao modal e derivar `procOpts` lá dentro com `useMemo` dependente de `r.tipo`. Ou, mais simples: manter `procOpts` no pai como função `getProcOpts(tipo)` e chamar no modal. Vou optar por derivar dentro do modal (menor refactor de props se o modal já recebe `procedimentos`; caso contrário, adiciono a prop).

3. **Reset ao trocar de categoria** — no `onValueChange` da Categoria (linha 1017), se o `procedimento_id` atual não pertencer à nova categoria, limpar `procedimento_id` junto com `tipo`.

4. **Mesma lógica ao trocar Especialidade?** — o usuário só pediu categoria; não vou mexer em especialidade para respeitar o escopo.

## Comportamento resultante
- Categoria vazia → todos os serviços aparecem (como hoje).
- Categoria = "consulta" → dropdown de serviço mostra só procedimentos com `tipo = 'consulta'`.
- Trocar categoria com serviço já escolhido incompatível → serviço volta para "Qualquer serviço".
