# Ajustes na Agenda

## 1) Visão "Por médico" — remover controles duplicados

No componente `AgendaPorMedicoGrid` (em `src/routes/_authenticated/app.agenda.tsx`), o cabeçalho atual repete o seletor de médico e os botões "3 dias / 5 dias / 7 dias". Como esses dados já podem ser definidos nos filtros principais (Profissional + Data Ref.), vamos remover essa barra duplicada.

- Remover do `AgendaPorMedicoGrid`:
  - `SearchableSelect` de médico
  - Botões "3 dias / 5 dias / 7 dias"
  - Navegação ←/→ + label "DD/MM — DIA → DD/MM — DIA" (a navegação de data já existe nos filtros principais)
- O médico exibido passa a ser o do filtro `filtroMedico` (quando = "todos", mostrar mensagem "Selecione um profissional nos filtros para visualizar a agenda por médico").
- A quantidade de dias passa a ser controlada por um novo campo nos filtros principais: **"Período"** (com opções 3, 5, 7 dias, ou intervalo customizado — ver item 2).
- Como `medicoView` e `diasView` deixam de existir como estado próprio da view, remover esses states e passar a derivar do filtro.

## 2) Filtro de data com opção "Período"

Hoje o campo "Data Ref." é um `<Input type="date">` simples com setas ←/→. Vamos trocar por um **DatePicker (Popover + Calendar do shadcn)** com:

- Botão "Limpar" (limpa a data → volta para hoje)
- Botão "Hoje" (define para hoje)
- **Novo botão "Período"** — alterna o calendário para modo `range` (seleção de data inicial e final). Ao confirmar, a Agenda passa a buscar/exibir agendamentos entre as duas datas.

Comportamento:
- Modo **dia único** (padrão): igual hoje — `dataRef` é uma data, queries usam intervalo do dia.
- Modo **período**: novo estado `dataFim` opcional; quando definido, `load()` busca de `dataRef` 00:00 até `dataFim` 23:59. A visão "Por médico" usa o nº de dias do período como `dias` da grade (limitado a um máximo razoável, ex.: 31).
- Na visão "Lista" (dia), quando período estiver ativo, listar agendamentos do intervalo inteiro agrupados por data.

## 3) Arquivos afetados

- `src/routes/_authenticated/app.agenda.tsx`
  - Substituir input de data por um componente `DateRangeField` interno (Popover + Calendar com modos `single`/`range`, botões Hoje / Limpar / Período).
  - Novo state `dataFim: string | null`; ajustar `load()` para usar intervalo `[dataRef, dataFim ?? dataRef]`.
  - Remover `medicoView`, `diasView` e a barra superior do `AgendaPorMedicoGrid`.
  - Derivar `medicoId` da grade a partir de `filtroMedico`; derivar `dias` a partir do período (ou default 1 / placeholder se sem médico).
  - Adicionar guard "selecione um profissional" quando `filtroMedico === "todos"` em modo "Por médico".

## Fora do escopo

- Não mexer no toggle "Lista / Por médico" do header.
- Não alterar layout interno da grade (linhas/colunas, cores de status).
- Não alterar auditoria, financeiro ou outras telas.
