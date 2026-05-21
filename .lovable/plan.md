## Objetivo

Quando um pagamento agrupa vários agendamentos do mesmo paciente envolvendo profissionais diferentes, imprimir **uma única Guia de Atendimento (GR)** contendo várias seções — uma por profissional — em vez de imprimir apenas a do agendamento principal.

## Situação atual

- `src/lib/print-gr.ts` (`printGuiaAtendimento`) gera a GR de **um único** `agendamentoId`.
- Em `src/routes/_authenticated/app.agenda.tsx` (linha ~1079), após salvar um pagamento agrupado, é chamada `printGuiaAtendimento` apenas com `pagamentoAgId` (o principal). Os `pagamentoExtraIds` ficam de fora da impressão.
- Resultado hoje: paciente paga 3 consultas (Dr A, Dr B, Dr C) → sai só a GR do Dr A.

## Mudanças propostas

### 1. `src/lib/print-gr.ts` — nova função `printGuiaAtendimentoAgrupada`

Assinatura:
```ts
printGuiaAtendimentoAgrupada({
  agendamentoIds: string[],          // todos os ids (principal + extras)
  clinicaId, usuarioNome, usuarioId,
  pagamento: { valor, forma_pagamento, parcelas, bandeira_cartao, detalhe }
})
```

Comportamento:
- Busca em paralelo todos os agendamentos, agrupa por `medico_id`.
- Para cada grupo de profissional, calcula:
  - lista de procedimentos (linhas QTD / PROCEDIMENTO)
  - subtotal do grupo (soma dos valores dos procedimentos do médico, derivados da tabela `procedimentos` da clínica, mesma lógica de hoje)
  - repasse clínica × prestador desse médico (usa `medico_convenios` / padrão do médico — lógica já existente reutilizada)
- Cabeçalho único: dados da clínica, paciente, data/hora, usuário, "GUIA DE ATENDIMENTO", indicação de via.
- Corpo: um bloco por profissional, separado por linha tracejada:
  ```
  PROFISSIONAL: DR. FULANO
  QTD  PROCEDIMENTO
   1   CONSULTA CARDIOLOGIA   R$ 150,00
   1   ECG                     R$  80,00
  SUBTOTAL                     R$ 230,00
  CLINICA                      R$  46,00
  PRESTADOR                    R$ 184,00
  ----
  ```
- Rodapé único: **VALOR TOTAL RECEBIDO** (= `pagamento.valor` informado pelo caixa), forma de pagamento (com detalhe se misto, parcelas/bandeira se crédito), totais consolidados (CLINICA total / PRESTADORES total).
- Controle de vias: registra **uma única** linha em `gr_impressoes` por id (vias separadas por agendamento permanecem por id, para manter o limite de 2 vias já existente), mas a janela de impressão é única. Reimpressão: `reimprimirGuiaAtendimentoAgrupada` repete sem incrementar.

A função `printGuiaAtendimento` (caso de 1 agendamento) continua existindo e é usada como atalho/fallback (a nova função pode internamente delegar para a antiga quando `agendamentoIds.length === 1`).

### 2. `src/routes/_authenticated/app.agenda.tsx`

No `onSavedWithData` (linha ~1079), substituir a chamada atual por:

```ts
const todos = [pagamentoAgId, ...pagamentoExtraIds];
await printGuiaAtendimentoAgrupada({
  agendamentoIds: todos,
  clinicaId: clinicaAtual.clinica_id,
  usuarioNome: ...,
  usuarioId: user?.id ?? null,
  pagamento: { valor, forma_pagamento, parcelas, bandeira_cartao, detalhe },
});
```

Botão "Imprimir GR" individual (`imprimirGR`, linha 690) continua usando `printGuiaAtendimento` — sem mudança.

## Pontos a confirmar com o usuário

1. Quando o pagamento agrupado é de **um único profissional** com vários procedimentos, devo mesmo assim usar o novo layout consolidado (uma seção só, com várias linhas QTD/PROCEDIMENTO)? Resposta esperada: **sim**, fica mais limpo que imprimir N guias.
2. O **VALOR TOTAL** impresso no rodapé deve refletir exatamente o que foi cobrado no caixa (`pagamento.valor`), mesmo que difira da soma dos valores cadastrados em `procedimentos` (descontos, ajustes manuais)? Suposição: **sim**.
3. Os blocos CLINICA / PRESTADOR por profissional devem aparecer **por médico** (como acima) **e** também um total geral no rodapé? Suposição: **sim, ambos**.

Se as três suposições estiverem corretas, sigo direto. Caso queira ajustar algo, me avise antes da implementação.
