## Aba Prontuário — filtros e destaque dos títulos

Alterações em `src/components/clientes/cliente-form.tsx`, dentro do `TabsContent value="prontuario"`.

### 1. Barra de filtros (acima da lista)

Adicionar uma linha de filtros responsiva com 4 campos + botão:

- **Data**: dois inputs `type="date"` (De / Até) para intervalo. Vazio = sem filtro.
- **Nome do médico**: input de texto livre, comparação case-insensitive contra `medico_nome`.
- **Item**: input de texto que pesquisa em todos os campos textuais do prontuário (queixa principal, história, exame físico, hipótese, conduta, prescrição, observações).
- **Botão "Pesquisar"** (ícone `Search`): aplica os filtros aos registros já carregados.
- **Botão "Limpar"** secundário: zera os 4 campos e mostra todos.

Os filtros são aplicados **localmente** sobre `prontList` (já carregado do Supabase) — não refaz query. O resultado vai para um estado `prontFiltered` que substitui `prontList` na renderização. Enquanto o usuário digita, nada muda; só ao clicar em "Pesquisar" (ou Enter no input) o filtro é aplicado. Mensagem "Nenhum registro encontrado com esses filtros" quando o filtro zera os resultados (diferente da mensagem atual de "nenhum registro para este paciente").

### 2. Destaque dos títulos dos prontuários

Hoje os rótulos ("Queixa principal", "Exame físico", "Prescrição"...) são `text-xs font-medium text-muted-foreground` — quase invisíveis. Mudar para:

- `text-sm font-semibold text-foreground` com leve `uppercase tracking-wide`
- Pequena barra de cor `border-l-2 border-primary pl-2` antes do rótulo, ou um separador sutil acima
- Espaçamento maior entre blocos (`space-y-3` no card)

O cabeçalho do card (data + nome do médico) ganha um peso visual maior: data em `text-base font-semibold`, médico permanece à direita.

### Detalhes técnicos

- Novo estado: `filtroDataDe`, `filtroDataAte`, `filtroMedico`, `filtroItem`, `prontFiltered`.
- `useEffect` reseta `prontFiltered = prontList` sempre que `prontList` muda (ao trocar de paciente).
- Função `aplicarFiltro()` filtra por intervalo de data (comparando `new Date(r.data)`), substring no nome do médico e substring em qualquer campo textual.
- Sem mudanças no backend, sem novas migrations.
