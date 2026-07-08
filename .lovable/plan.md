## Objetivo

Permitir selecionar vários atendimentos já pagos e imprimir um único comprovante de **2ª via** com todos eles juntos, agrupados por médico (fluxo típico: pagamento diário por médico).

## Situação atual

- A coluna de checkbox já existe, mas o checkbox só aparece para atendimentos **não pagos** (usado no fluxo "Pagar repasse").
- Atendimentos pagos só permitem reimpressão individual, item a item (ícone de impressora na linha).

## Mudanças

### 1. Habilitar checkbox também para atendimentos pagos
Em `src/routes/_authenticated/app.financeiro.atendimentos.tsx`, na célula da coluna de seleção, mostrar o `Checkbox` também quando `a.repasse_pago === true`. O estado `sel` já existente é reutilizado (evita duas listas paralelas).

### 2. "Selecionar todos" respeita a aba visível
O checkbox do cabeçalho (`toggleAll`) continua funcionando; ao alternar entre "Pagos"/"A pagar" via filtro `fStatus`, o comportamento segue igual (marca todos os filtrados).

### 3. Ações contextuais dos botões
- **"Pagar repasse"**: fica habilitado apenas quando **todos** os itens selecionados estão **não pagos** (comportamento igual a hoje na prática, mas com validação explícita para não confundir quando misturar).
- **Novo botão "Imprimir 2ª via (N)"**: aparece no topo (ao lado de "Pagar repasse") **e** também no rodapé da tabela (barra flutuante já existente). Habilita apenas quando **todos** os selecionados estão **pagos**. Ao clicar:
  - Se todos os selecionados forem do mesmo médico → gera um único comprovante em 2ª via com todos os itens.
  - Se houver mais de um médico selecionado → agrupa por médico e emite **um comprovante por médico** (abre um após o outro, ou concatena em blocos separados no mesmo diálogo com quebras de página CSS `break-after: page`). Vou adotar a segunda abordagem (um único diálogo com múltiplos blocos), para permitir imprimir tudo em uma passagem.
- Quando os selecionados misturam pagos e não pagos, ambos os botões ficam desabilitados com tooltip explicando por quê.

### 4. Metadados do comprovante em lote
- `data do pagamento` e `horário`: usa o `repasse_pago_em` / `repasse_pago_at` do próprio atendimento (cada linha do bloco pode ter data diferente; no cabeçalho de cada bloco, mostrar a data/hora do primeiro pagamento e, se houver várias, uma nota "Contém pagamentos de N datas").
- `forma de pagamento` e `conta`: se todos os itens do bloco compartilham, exibe o valor; se divergem, exibe "Vários".
- Banner **SEGUNDA VIA** já existente é reutilizado em cada bloco.

### 5. Barra flutuante no rodapé
A barra que hoje mostra "N atendimento(s) • total" quando há seleção ganha o novo botão "Imprimir 2ª via" ao lado do "Pagar repasse", com as mesmas regras de habilitação.

## Detalhes técnicos

- Arquivo único: `src/routes/_authenticated/app.financeiro.atendimentos.tsx`.
- `buildComprovante` ganha um modo "múltiplos blocos": nova função `buildComprovanteLote(gruposPorMedico)` que reutiliza a lógica atual e monta uma lista de `Comprovante` renderizados sequencialmente no diálogo.
- Sem mudanças de schema, sem migration.
- Sem alterações em outras telas.

## Fora de escopo

- Não muda o cálculo de repasse, RLS, permissões.
- Não afeta o fluxo de estorno nem o pagamento em si (só reimpressão).
