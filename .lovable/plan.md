## Objetivo

Remover o acionador de pagamento rápido de mensalidade do cartão de três telas onde ele é redundante, mantendo-o apenas na Agenda.

## Situação atual (verificada no código)

O mesmo diálogo (`FaturamentoRapidoMensalidadeDialog`) é aberto em 4 telas:

| Tela | Rótulo do botão | Ação |
| --- | --- | --- |
| Caixa | 💳 Mensalidade do cartão | **remover** |
| Ficha do cliente › bloco Cartão Benefícios | Pagar mensalidade | **remover** |
| Cartão Benefícios › Contratos | Faturamento rápido | **remover** |
| Agenda | 💳 Mensalidade do cartão | manter |

## O que será feito

1. **Caixa** — remover o botão do cabeçalho, o diálogo e o estado que só existia para ele.
2. **Ficha do cliente** — remover o botão do cabeçalho do bloco "Cartão Benefícios", o diálogo e o estado.
3. **Contratos** — remover o botão "Faturamento rápido"; o botão **"Vendas"** (nova venda) continua no mesmo lugar.
4. Limpar imports/ícones que ficarem sem uso nesses três arquivos.

Aplicado para as 3 clínicas (mudança de interface, sem flag).

## O que NÃO será alterado

- Nenhuma regra financeira, de contrato, mensalidade ou caixa.
- O diálogo em si (`faturamento-rapido-dialog.tsx` e `pagamento-avulso-dialog.tsx`) permanece intacto e continua funcionando pela Agenda.
- A Agenda segue exatamente como está.

## Detalhes técnicos

- `src/routes/_authenticated/app.caixa.tsx`: remover `<Button>` (~2314-2316), `<FaturamentoRapidoMensalidadeDialog>` (~2319), `useState fatRapidoOpen` (~349) e o import (linha 12).
- `src/components/clientes/paciente-cartoes-beneficios.tsx`: remover `<Button>` (~188-190), o diálogo (~192-198), o `useState` (~59) e o import (linha 16).
- `src/components/pages/contratos-page.tsx`: remover o `<Button>` "Faturamento rápido" (~653-656), o diálogo (~664-670), o `useState` (~300) e o import (linha 82); manter o botão "Vendas".
- Rodar checagem de tipos ao final.

## Risco / rollback

Baixo: alteração apenas de apresentação. Rollback = reverter a versão pelo histórico.
