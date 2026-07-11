## Diagnóstico

Ao clicar em cobrar o agendamento **CONSULTA (GINECOLOGIA)** da Tuane, o sistema tratou como gratuidade e não gerou GR. Investigando, encontrei dois problemas na aplicação das regras do cartão-convênio:

### 1) Regra por especialidade não bate quando o serviço da agenda tem sufixo "(ESPECIALIDADE)"

Na função `obterInfoConvenioPaciente` (src/routes/_authenticated/app.agenda.tsx, linha ~289) o nome do procedimento é buscado no cadastro **sem remover o sufixo** de desambiguação. O agendamento aparece como `CONSULTA (GINECOLOGIA)`, mas o cadastro tem só `CONSULTA` (tipo `consulta`). Como nenhum procedimento tem esse nome literal, `procRow` fica `null`, `procedimentoTipo = null` e `procedimentoId = null`.

Consequência: em `findRegra` a regra "GINECOLOGIA / tipo=consulta / R$ 9,99" é descartada (o filtro exige que `r.tipo` case com `tipoNorm`, mas `tipoNorm` está `null`). O sistema conclui "sem benefício" ou pega uma regra errada dependendo do estado do cache, e cobrança sai zero — foi exatamente o que ocorreu com a consulta da Tuane.

O `buscarProcedimentoPorNome` (linha ~132) já remove esse sufixo — a inconsistência é só em `obterInfoConvenioPaciente`.

### 2) Gratuidade nunca gera GR

Quando a regra escolhida tem `gratuito=true`, o `desconto` sai como `{ tipo:"gratuidade", valor:0 }` e o total das opções vai a zero. O fluxo em `cobrarAgendamento` (linha ~2989) cai no branch **"SEM COBRANÇA"**: grava um lançamento de R$ 0, marca como pago e **não abre a tela de cobrança nem imprime GR**. É por isso que o PREVENTIVO (correto como gratuidade) não gerou uma guia com forma de pagamento visível.

## Correções

### A) Normalizar o nome do procedimento em `obterInfoConvenioPaciente`

Antes de comparar contra o cadastro, remover o sufixo `" (…)"` no fim do nome, exatamente como faz `buscarProcedimentoPorNome`:

```ts
const nomeBase = (procedimentoNome ?? "").replace(/\s*\([^()]*\)\s*$/, "").trim();
const procNorm = nomeBase.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
```

Assim `CONSULTA (GINECOLOGIA)` resolve para o cadastro `CONSULTA` (tipo `consulta`), `procedimentoTipo` volta a ser `"consulta"` e a regra da especialidade **GINECOLOGIA / consulta / R$ 9,99** é aplicada corretamente. O mesmo raciocínio vale para qualquer outra especialidade — o sistema volta a diferenciar consulta vs. exame vs. preventivo.

### B) Emitir GR para gratuidade com forma "Convênio Gratuidade"

Alterar `cobrarAgendamento` (e o trecho equivalente do fluxo de novo agendamento, linhas ~2706–2732) para tratar `info.desconto?.tipo === "gratuidade"` como um **pagamento especial**, não como "sem cobrança":

- Nova forma de pagamento interna: `convenio_gratuidade`.
- Em `src/lib/print-gr.ts`, adicionar no `FORMA_LABEL`: `convenio_gratuidade: "CONVÊNIO GRATUIDADE"`. Uma via só (comportamento já é o default para formas não eletrônicas).
- No fluxo de cobrança, quando o desconto for gratuidade:
  - Pular o diálogo de forma de pagamento (não há o que escolher).
  - Registrar `fin_lancamentos` com `valor = 0`, `forma_pagamento = "convenio_gratuidade"`, `status = "confirmado"`, descrição contendo `— Convênio X (GRATUIDADE)`.
  - Marcar o agendamento como pago (`data_pagamento`, `pagosSet`) e avançar o fluxo (mesmo checkin/triagem que o pagamento normal faz hoje).
  - Chamar o mesmo `imprimirGR` usado para os demais pagamentos, passando `{ forma_pagamento: "convenio_gratuidade", valor: 0 }` — a GR sai com paciente, ficha, profissional, serviço e "FORMA DE PAGAMENTO: CONVÊNIO GRATUIDADE" e "VALOR: R$ 0,00".

O branch atual "SEM COBRANÇA" continua existindo, mas só para o caso legítimo (procedimento cadastrado com valor 0 sem envolver convênio — ex.: retorno gratuito).

### C) Reprocessar o caso da Tuane

Após publicar o fix, o operador deve estornar o lançamento errado da consulta (R$ 0) pelo fluxo normal do Financeiro e cobrar novamente — a consulta passará a sair como R$ 9,99 (regra GINECOLOGIA/consulta), e o preventivo continuará gratuidade, mas agora com GR impressa. Não precisa migração — apenas re-cobrar.

## Detalhes técnicos (resumo)

- `src/routes/_authenticated/app.agenda.tsx`
  - `obterInfoConvenioPaciente`: strip do sufixo `(…)` antes da busca de `procRow`.
  - Extrair um helper `registrarGratuidade(a, info, opcoes, ctx)` reusado nos dois trechos que hoje chamam o branch "SEM COBRANÇA" (novo agendamento e re-cobrança). Ele grava lançamento com `forma_pagamento="convenio_gratuidade"` e chama a mesma rotina de impressão de GR usada após pagamento normal.
- `src/lib/print-gr.ts`: adicionar `convenio_gratuidade` ao `FORMA_LABEL`. Nenhuma outra mudança — a função já lida com `valor = 0`.
- Nenhuma migração de schema. `forma_pagamento` é texto livre em `fin_lancamentos`.

## Fora do escopo

- Não altero as regras cadastradas do convênio da Tuane (elas estão corretas: PREVENTIVO gratuito, GINECOLOGIA consulta R$ 9,99).
- Não mexo em `reaplicar` (usado no cadastro de regras) — o problema é só na leitura em tempo de cobrança.
