## Objetivo

Reformular a tabela de regras do convênio em `src/components/cartao-beneficios/regras-tab.tsx`:

1. **Remover o agrupamento por carência** (linhas "Imediato", "Após 2ª mensalidade"…). Tudo volta a ser uma lista única.
2. **Ordenar alfabeticamente crescente** por: Serviço → Especialidade → Categoria (regras sem serviço/especialidade caem para o fim de cada nível).
3. **Adicionar filtros** acima da tabela — 3 selects:
   - Gratuito: Todos / Sim / Não
   - Carência: Todos / Imediato / Após 1ª / 2ª / 3ª / 6ª / 12ª mensalidade
   - Limite: Todos / Com limite / Sem limite
4. **Destacar o cabeçalho da tabela**: fundo mais forte (`bg-muted`), texto `font-semibold` em cor mais escura, `uppercase` com tracking, borda inferior mais marcada e cabeçalho `sticky top-0` para permanecer visível ao rolar.

## Mudanças (apenas `regras-tab.tsx`)

- Remover a lógica de `buckets` por `carencia_mensalidades` e a `TableRow` de grupo com `<Timer />`.
- Adicionar `useMemo` com `regrasFiltradas` aplicando os 3 filtros e ordenando por nome de serviço/especialidade/categoria (usa mapas `procedimentos`/`especialidades` já carregados para lookup de nomes).
- Adicionar estado local: `filtroGratuito`, `filtroCarencia`, `filtroLimite`.
- Renderizar uma barra de filtros compacta (3 `Select` shadcn) entre o header da aba e a tabela.
- Ajustar `<TableHeader>` / `<TableHead>` com classes: `bg-muted sticky top-0 z-10`, `<TableHead className="font-semibold text-foreground uppercase text-[11px] tracking-wide border-b-2">`.
- Manter a coluna "Carência" na tabela (o select por linha continua funcional para edição rápida).
- Manter comportamento do dialog de nova regra, salvar, reaplicar, limite e exclusão inalterados.

## Observação

- Sem mudanças no banco. Só apresentação/filtros no cliente.
