## Objetivo

Exibir no comprovante de pagamento do médico o horário exato do pagamento (não só a data). Quando o comprovante for reemitido (segunda via), destacar claramente que é uma **SEGUNDA VIA** e mostrar a data + hora do pagamento original.

## Situação atual

- Coluna `repasse_pago_em` em `fin_lancamentos` e `fin_atendimentos` é do tipo `date` (só guarda o dia). Por isso não há como recuperar o horário de pagamentos.
- O comprovante já mostra "Data do pagamento" (só dia) e "Emitido em" (data+hora do momento da impressão). Não há distinção entre 1ª e 2ª via.

## Mudanças

### 1. Banco de dados (migration)
- Adicionar coluna `repasse_pago_at timestamptz` em `fin_lancamentos` e `fin_atendimentos`.
- Backfill: `repasse_pago_at = repasse_pago_em::timestamptz` para linhas antigas já pagas (só data → 00:00 do dia; comportamento aceitável para históricos, será sinalizado como "horário não registrado" na UI quando faltar hora precisa).
- Índice não é necessário (uso pontual).

### 2. Gravação do pagamento (`confirmarPagamento`)
- No update de `repasse_pago_*`, gravar também `repasse_pago_at: new Date().toISOString()` (momento real do clique em "Confirmar pagamento"), independente da `payForm.data` que o usuário escolher para o lançamento contábil.
- Continuar gravando `repasse_pago_em` como está (data do lançamento).

### 3. Query e tipo
- Adicionar `repasse_pago_at` no SELECT das duas fontes (linhas 644 e 652) e no tipo `Atend`.

### 4. Comprovante (`buildComprovante` + diálogo)
- Novo formato de `Comprovante`:
  - `dataPagamento` continua sendo a data do lançamento.
  - Novo campo `horaPagamento: string | null` — HH:mm derivado de `repasse_pago_at`.
  - Novo campo `reimpressao: boolean`.
- **Primeira via** (fluxo `confirmarPagamento`): passa `reimpressao=false` e `horaPagamento = new Date()` recém-gravado.
- **Segunda via** (`abrirComprovanteDoItem`): passa `reimpressao=true`, `dataPagamento` e `horaPagamento` extraídos de `repasse_pago_at` da linha; quando só houver `repasse_pago_em` (registros antigos), mostrar `horaPagamento = null` com texto "horário não registrado".

### 5. UI do comprovante
- Substituir o campo "Data do pagamento" por "Data e hora do pagamento: dd/mm/aaaa às HH:mm".
- Quando `reimpressao=true`:
  - Banner vermelho no topo do comprovante (visível na tela e na impressão) com texto grande: **"SEGUNDA VIA — Reimpressão de comprovante"**.
  - Bloco destacado abaixo do banner: "Pagamento realizado em: dd/mm/aaaa às HH:mm" (ou "horário não registrado" quando faltar).
  - Manter "Emitido em: {emitidoEm}" (data/hora da reimpressão) claramente separado, para não confundir com o pagamento original.

## Detalhes técnicos

- Arquivo principal: `src/routes/_authenticated/app.financeiro.atendimentos.tsx`.
- Migration nova para adicionar `repasse_pago_at` nas duas tabelas + backfill.
- Sem mudanças em outras telas; a página de gestão de repasses continua igual.
- CSS de impressão: reutilizar classes existentes (`print-area`, `no-print`); banner usa `bg-rose-100 border-rose-500 text-rose-900`.

## Fora de escopo

- Não alterar cálculo de repasse, RLS, permissões, agendamento ou fluxo de estorno.
- Não retroativar horários reais de pagamentos antigos (não existem no banco); apenas sinalizar quando ausente.
