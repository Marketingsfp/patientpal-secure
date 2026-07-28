## O que você precisa

Paciente foi faturado na clínica parceira (GR emitida lá), mas é atendido aqui. Aqui ele precisa: entrar na agenda, passar pelo fluxo normal (recepção, triagem, atendimento) e **não** passar pelo caixa. O médico que atende aqui, porém, geralmente tem repasse a receber.

Hoje o sistema só conhece dois tipos de atendimento (`particular` e `convenio`) e todo agendamento tende a cair no caixa. Não existe hoje nenhum campo que marque "já faturado fora" — isso é o que vamos criar.

## A dinâmica proposta (simples, em 3 passos)

**Passo 1 — Agendar como "Externo"**
No wizard de novo agendamento, ao lado de Particular / Convênio, entra a opção **"Externo (faturado em outra clínica)"**. Ao escolher, aparecem 3 campos:
- Clínica de origem (lista: as 3 clínicas + "Outra")
- Nº da GR da clínica parceira (obrigatório — é a rastreabilidade)
- Valor cobrado lá (opcional, só para conferência/acerto entre clínicas)

**Passo 2 — Atendimento sem caixa**
O agendamento nasce com a etapa de caixa pulada e um selo laranja **"EXTERNO — GR nº ..."** no card da agenda. Os botões "Pagar" / "Salvar e Pagar" ficam ocultos para esse agendamento; no lugar aparece "Confirmar chegada". Nada é lançado em caixa nem em nota fiscal daqui.

**Passo 3 — Repasse do médico local**
O atendimento é registrado em Atendimentos/Repasse com valor recebido pela clínica = R$ 0 e o valor do médico calculado pela regra normal dele. Assim o repasse sai automático (fim do controle manual no sistema antigo) e o relatório mostra claramente "custo de atendimento externo".

## Relatório de acerto entre clínicas

Nova aba em Financeiro → **Atendimentos Externos**: lista por período e por clínica de origem, com paciente, GR de origem, médico, valor cobrado lá e repasse pago aqui. É esse relatório que fecha o acerto com a clínica parceira — hoje feito de cabeça/planilha.

## Quando as 3 clínicas estiverem no ClinicOS

A mesma tela, sem retrabalho: como a clínica de origem já é uma clínica do sistema, o campo "Nº da GR" passa a ser uma **busca do atendimento real** na clínica de origem. Escolhido o atendimento, o vínculo é feito por ID (não por número digitado), e o relatório de acerto vira automático nas duas pontas: na origem aparece "atendimento executado em outra unidade", aqui aparece "recebido de outra unidade". Nada muda no dia a dia da recepção.

## Detalhes técnicos

- Migração: novas colunas em `agendamentos` — `origem_externa` (bool), `origem_clinica_id` (uuid, nullable, FK `clinicas`), `origem_clinica_nome` (texto livre, para parceiras fora do sistema), `origem_gr_numero` (texto), `origem_valor` (numeric). Índice por `(clinica_id, origem_externa, inicio)`.
- `fin_atendimentos`: registro com `forma_pagamento = 'externo'`, `valor_total = origem_valor`, `valor_clinica = 0`, `valor_medico` pela regra do médico, `lancamento_id` nulo — entra no repasse sem tocar em `fin_lancamentos` nem `caixa_movimentos`.
- Frontend: `novo-agendamento-wizard.tsx` (nova opção + campos), `app.agenda.tsx` (selo, ocultar pagamento, pular etapa caixa), `criar-agendamento.functions.ts` (validação: GR obrigatória, bloquear vínculo com orçamento/CB), nova rota `app.financeiro.atendimentos-externos.tsx`.
- Permissão: só recepção/gestor/admin podem marcar um agendamento como externo; alteração fica registrada na auditoria.

## Fora do escopo / a confirmar antes de eu implementar

1. O repasse ao médico local deve mesmo sair daqui, ou a clínica parceira também paga o médico? (assumi: **sai daqui**)
2. O valor cobrado na parceira deve ser obrigatório ou opcional? (assumi: **opcional**, só para conferência)
3. Esses atendimentos devem contar nos indicadores de produção do Painel (volume), mesmo com receita zero? (assumi: **sim no volume, zero na receita**)

Não vou mexer em caixa, NFS-e, valores de Cartão Consulta nem em contratos.
