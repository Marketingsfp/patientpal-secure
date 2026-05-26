
# Tipo de cobrança no contrato: Boleto ou Carnê

Remover o seletor "Forma de pagamento" da venda do convênio e substituir por uma escolha entre **Boleto** e **Carnê** (radio — uma OU outra). Forma de pagamento real continua sendo perguntada apenas na hora de baixar cada parcela (fluxo já existente).

## Mudanças no formulário de venda (`NovoContratoDialog`)

Remover:
- `<Select>` "Forma de pagamento" (linhas 418-429) e o aviso "+ R$3,50 de taxa de boleto por parcela".
- State `forma` deixa de existir como dropdown.

Adicionar no lugar (mesma posição, `col-span-2`):
- Label "Tipo de cobrança"
- Dois cards/botões em grid 2 colunas (radio mutuamente exclusivo):
  - **Boleto bancário** — ícone Barcode + descrição "Geramos o boleto via banco para cada parcela. Taxa de R$ 3,50 por boleto."
  - **Carnê interno** — ícone FileText + descrição "Geramos um PDF do carnê com todas as parcelas. Sem taxa."
- Card selecionado fica com borda primary + check.

Novo state: `tipoCobranca: "boleto" | "carne"` (default `"carne"`).

No `salvar()`:
- `forma_pagamento` do contrato passa a gravar `"boleto"` ou `"carne"` conforme escolhido.
- A taxa de R$3,50/parcela continua sendo aplicada quando `tipoCobranca === "boleto"`.
- Após criar o contrato e as parcelas:
  - **Carnê**: chamar `gerarCarnePDF(contratoId)` automaticamente e abrir/baixar o PDF.
  - **Boleto**: chamar `gerarBoletosBanco(contratoId)` — função stub preparada para integração futura (ver abaixo).

## Geração do Carnê interno

Novo arquivo `src/lib/print-carne.ts`:
- Função `gerarCarnePDF(contratoId, clinicaId)` que:
  - Carrega contrato + plano + paciente + clínica + parcelas.
  - Monta HTML A4 com layout de carnê simples: cabeçalho com logo/nome da clínica, dados do contrato (nº, titular, CPF, plano, valor), e **uma "ficha" por parcela** dispostas 3 por página, cada ficha com:
    - Nº da parcela / total
    - Vencimento
    - Valor
    - Linha "Pago em: ___ / Forma: ___" (campos para preenchimento manual)
    - Linha picotada de corte entre fichas
  - Abre em nova janela e dispara `window.print()` para salvar como PDF.
- Mesmo padrão visual de `src/lib/print-gr.ts` (já existe na codebase).

Botão "Reimprimir carnê" adicionado no header do `DetalheContrato` quando `forma_pagamento === "carne"`.

## Geração de Boletos (stub para integração)

Novo arquivo `src/lib/boleto.functions.ts` (server function):
- `gerarBoletosContrato({ contratoId })` — `createServerFn` com middleware `requireSupabaseAuth`.
- Por enquanto:
  - Lê o contrato + parcelas.
  - Para cada parcela cria/atualiza um registro em nova tabela `boletos` (ver migração abaixo) com `status='pendente_emissao'`.
  - Retorna `{ pendentes: N, mensagem: "Integração bancária não configurada — boletos marcados como pendentes." }`.
- A lógica real (chamada à API do banco — Itaú/Sicredi/Asaas/etc.) fica isolada nessa função, comentada com `TODO: integrar API do banco`.

Migração nova (`boletos`):
- Colunas: `id`, `clinica_id`, `contrato_id`, `mensalidade_id` (FK), `nosso_numero` (text, nullable), `linha_digitavel` (text, nullable), `codigo_barras` (text, nullable), `url_pdf` (text, nullable), `valor`, `vencimento`, `status` (`pendente_emissao` | `emitido` | `pago` | `cancelado`), `banco` (text, nullable), `created_at`, `updated_at`.
- GRANTs para `authenticated` e `service_role`.
- RLS por `clinica_id` (mesmo padrão das demais tabelas do projeto).

Botão "Reemitir boletos" no header do `DetalheContrato` quando `forma_pagamento === "boleto"`.

## Pagamento das parcelas — sem mudança

O fluxo já existente em `DetalheContrato` continua igual: ao clicar **Pagar** numa parcela, abre o diálogo "Forma de pagamento" (Dinheiro / PIX / Cartão / etc.) e gera a GR. Nenhuma alteração nesse fluxo.

## Fora do escopo
- Integração real com banco (fica como stub `TODO`, pronta para receber as credenciais e o cliente HTTP do banco escolhido).
- Mudar o cadastro de convênio (não precisa de novo campo).
- Mudar contratos antigos com `forma_pagamento` em "dinheiro/pix/cartao" — eles continuam exibindo o valor antigo no campo, sem botão de boleto/carnê.
