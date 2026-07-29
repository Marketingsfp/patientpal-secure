## Objetivo

No diálogo **Atendimento externo** (agenda), o campo "Clínica de origem" deixa de ser texto livre e passa a oferecer uma lista suspensa com as unidades cadastradas no sistema.

## Situação atual (verificada)

- `src/components/agenda/atendimento-externo-dialog.tsx` usa um `<Input>` livre e envia sempre `origem_clinica_id: null`, só o nome digitado.
- O banco tem 3 unidades cadastradas: POLICLINICA MENINO JESUS, POLICLINICA SAO FRANCISCO DE PAULA e CLINICA CONSULTA HOJE.
- As unidades do usuário já estão disponíveis no app via `useClinica()` (`memberships`), sem consulta nova.

## O que vou fazer

1. Trocar o campo por um **seletor** com as unidades cadastradas, ordenadas por nome, ocultando a unidade em que o agendamento está sendo feito (não faz sentido "externo" para ela mesma).
2. Manter uma opção **"Outra clínica (digitar)"** ao final da lista, que revela o campo de texto — assim clínicas parceiras que não estão cadastradas continuam funcionando.
3. Ao escolher uma unidade da lista, gravar também o **identificador da unidade** (`origem_clinica_id`) além do nome, deixando o acerto entre clínicas rastreável. Na opção "Outra", grava só o nome, como hoje.
4. Nenhuma mudança em valores, repasse, caixa ou nota fiscal — o comportamento de registro segue idêntico.

## Detalhes técnicos

- Arquivo: `src/components/agenda/atendimento-externo-dialog.tsx`.
- Fonte da lista: `memberships` de `@/hooks/use-clinica` (já em contexto, sem round-trip). Filtro: `clinica_id !== clinicaId` da prop.
- UI: componente `Select` do shadcn já usado no projeto; estado novo `origemId` (`string | "outra"`).
- Envio: `origem_clinica_id = origemId === "outra" ? null : origemId`; `origem_clinica_nome` = nome da unidade escolhida ou o texto digitado.
- Validação atual (nome obrigatório) mantida; GR continua obrigatória.
