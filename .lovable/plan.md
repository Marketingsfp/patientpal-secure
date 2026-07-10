Em **Caixa → Meu caixa → Movimentos**, adicionar filtros por médico e paciente e trocar o "Período" por um seletor com calendário (data inicial/final).

## O que muda na UI

Barra de filtros acima da tabela de movimentos (uma linha, com wrap em telas menores):

```text
[ Período ▾  01/07/2026 → 10/07/2026 ]   [ Médico ▾ ]   [ Paciente 🔍 ______ ]   [ Limpar ]
```

- **Período** — botão que abre um `Popover` com um `Calendar` de intervalo (react-day-picker `mode="range"`), já usado em `src/components/date-range-filter.tsx`. Presets rápidos ao lado: Hoje, Última semana, Última quinzena, Último mês, Todos. Fim das opções "Intervalo personalizado" separado — o intervalo agora é o próprio botão.
- **Médico** — `Select` com a lista distinta de médicos presentes nos movimentos carregados ("Todos" + nomes de `enrichPorLanc`).
- **Paciente** — `Input` de busca livre; casa com o nome extraído da descrição (o padrão é `"NOME PACIENTE — SERVICO"`), case-insensitive.
- **Limpar** — aparece quando algum filtro está ativo; volta a Hoje / Todos / vazio.

Comportamento:
- Filtros são combinados (AND). Contador "N de M movimentos" ao lado do título quando há filtro ativo.
- Vazio filtrado: mensagem "Nenhum movimento corresponde aos filtros" com botão "Limpar filtros".
- Para não-gestor (visão "Movimentos de hoje") os filtros de médico e paciente também aparecem, mas o período permanece fixo em "Hoje" (regra atual mantida).

## Onde mudar

Arquivo único: `src/routes/_authenticated/app.caixa.tsx`

1. Estender o estado do filtro (`meuPeriodo`, `meuDataIni`, `meuDataFim`) com `meuMedico: string` e `meuPaciente: string`.
2. Ajustar `minhasMovsFiltrados` (useMemo) para aplicar médico (via `enrichPorLanc.get(lancamento_id)?.medico`) e paciente (extraído de `m.descricao` antes do `—`).
3. Substituir o bloco atual do "Período" (linhas 1362–1402) pelo novo trio de controles usando `Popover` + `Calendar` do design system. Manter os presets como pequenos botões dentro do popover.
4. Derivar `medicosDisponiveis` (Set ordenado a partir de `enrichPorLanc`) para popular o Select.

## Fora de escopo

- Nenhuma mudança na aba "Todos (Financeiro)" ou "Repasse médico" — só "Meu caixa → Movimentos".
- Sem alteração de schema, RLS ou queries — filtragem 100% client-side sobre o que já é carregado.
- Sem novo componente compartilhado; se `date-range-filter.tsx` servir direto, reutilizo; senão faço inline com `Popover + Calendar` já existentes no projeto.
