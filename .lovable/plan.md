## Diagnóstico confirmado (com dados do banco)

Paciente **ZILMA CARNEIRO DE SOUZA DE ARAUJO** (contrato 20261605, CARTÃO CONSULTA + SEGUROS), 27/07/2026:

| Ficha | Médico / Especialidade | `tipo_atendimento` gravado | Pagamento |
|---|---|---|---|
| 007 | Sandro — Clínico Geral | **particular** | R$ 9,99, descrição "CONVENIO CARTAO CONSULTA + SEGUROS", forma: dinheiro |
| 006 | André Luis — Angiologia | convenio | ainda não pago |

As regras do convênio estão corretas: as 13 especialidades de consulta compartilham o grupo `consulta-diaria-cartao-consulta-seguro`, limite **1/dia por titular_ou_dependente**, excedente **50% do particular**.

**Causa raiz única (gera os 2 sintomas):** a sincronização do `tipo_atendimento` após o pagamento (`src/components/financeiro/lancamento-dialog.tsx`, ~linha 611) só marca "convenio" quando a **forma de pagamento** é "Convênio" ou a **categoria** é a do convênio. Como a taxa de R$ 9,99 foi paga **em dinheiro**, o agendamento permaneceu `particular`. Disso decorre:

1. A GR imprimiu **PARTICULAR** — `resolveConvLabel` em `src/lib/print-gr.ts` lê apenas o `tipo_atendimento`.
2. A cota diária não foi consumida — a contagem na Agenda (`src/routes/_authenticated/app.agenda.tsx`, linha 853) descarta atendimentos `particular` —, então o segundo atendimento do dia voltou a receber R$ 9,99 em vez dos 50%.

Não foi erro da funcionária: o formulário da agenda nasce com "Particular" por padrão e o caixa aplicou o desconto corretamente.

## Correção proposta (3 camadas)

### 1. Gravar corretamente o tipo do atendimento (causa)
`src/components/financeiro/lancamento-dialog.tsx` — considerar que o atendimento foi pelo convênio também quando a **descrição do lançamento contém o nome do convênio** (é assim que a Agenda monta a descrição ao aplicar o desconto). Pagar a taxa em dinheiro/PIX/cartão passa a marcar `tipo_atendimento = "convenio"`.

### 2. Contar a cota pelo pagamento real (rede de proteção + registros antigos)
`src/routes/_authenticated/app.agenda.tsx` (bloco do limite, ~linhas 838-855) — ao montar a lista que consome a cota, buscar os `fin_lancamentos` confirmados desses agendamentos e **também contar** os que indicam o convênio na descrição, mesmo com o agendamento marcado como `particular`. Corrige inclusive os registros já gravados errados, sem alterar dados históricos.

### 3. GR mostrar o convênio quando o desconto foi do convênio
`src/lib/print-gr.ts` — quando o lançamento do atendimento indica desconto do convênio, imprimir o nome do convênio no campo "CONV." em vez de "PARTICULAR" (a função `resolveVinculoConvenio` já existe e resolve o nome do plano do paciente).

Sem alterar valores, regras ou tabelas do Cartão Consulta (Regra 1.11 preservada) — apenas lógica de gravação, contagem e impressão.

## Escopo e confirmação necessária

- Fora do escopo: regras/valores de convênio, contratos, migrations de dados.
- É correção técnica, mas muda comportamento de cobrança e impressão: **confirmar se aplico nas 3 clínicas ou só na Policlínica São Francisco de Paula** (Regra 1.10 do AGENTS.md).

## Validação após implementar

1. Reabrir o faturamento da Ficha 006 (Dr. André) da Zilma → deve mostrar **50% do valor particular** com o aviso "Limite de 1/dia atingido".
2. Faturar a 1ª consulta do dia de outro paciente com convênio pagando em **dinheiro** → agendamento deve ficar como `convenio` e a GR sair com o nome do convênio.
3. A 1ª consulta do dia continua saindo R$ 9,99 normalmente.
