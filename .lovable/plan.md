## Escopo confirmado
Clínica **Menino Jesus** (`7570ddde-8c1c-4b55-ba72-cf12b2a6c940`). Corrigir os registros históricos com `medico_id` divergente entre `fin_lancamentos` e o agendamento de origem, e investigar o fluxo que gravou o médico errado — sem tocar em código nesta rodada.

## Diagnóstico atual (confirmado no banco)

- Os 2 pagamentos da Erika Kariny (13/07) existem em `fin_lancamentos`, mas com `medico_id = Elair (725382a3…)` em vez de `Marcílio (de89ddc5…)`, que é o médico do agendamento.
- Audit log confirma: no momento da inserção do lançamento (13/07 13:11 e 13:12), o agendamento **já estava** com Marcílio (inserido às 10:16). Ou seja, quem gravou o lançamento **não herdou** o médico do agendamento.
- Varredura completa na Menino Jesus encontrou **9 lançamentos** com `fl.medico_id ≠ agendamento.medico_id` (incluindo os 2 da Erika). Todos com médicos distintos entre si — não é um bug isolado do Marcílio.
- Os fluxos de código que consultei (`lancamento-dialog.tsx` linhas 358-382 e `app.caixa.tsx` linhas 1090-1117) fazem prefetch correto do `medico_id` a partir do agendamento. Não achei ainda o ponto que grava o médico errado.

## Ponto 1 — Correção dos 2 lançamentos da Erika Kariny

Migration que faz `UPDATE fin_lancamentos SET medico_id = agendamento.medico_id` **apenas** para os 2 IDs:
`76a40786-4610-4c3b-9d79-3c9692b613b6` e `fdbb066b-1ae9-4a9c-8823-108b56c1c794`.

Efeito: os dois atendimentos passam a aparecer no repasse do Dr. Marcílio (aba **Financeiro → Atendimentos**), com valores já contextualizados pelas regras de convênio/categoria.

Sem risco de duplicidade: os lançamentos já existem, só troca o vínculo de médico. Nenhum registro em `caixa_movimentos` é afetado.

## Ponto 2 — Varredura e correção em lote (Menino Jesus)

Antes de aplicar, apresento a lista completa dos 9 casos para você conferir paciente por paciente:

```text
Data agenda       Paciente                                    fl_medico → ag_medico
2026-07-21 11:30  MARLI CANDIDO DA SILVA                      (a validar)
2026-07-20 11:30  MICHELE MARQUES TAVARES                     (a validar)
2026-07-20 11:20  MARIA DAS NEVES PONTES RAMOS                (a validar)
2026-07-17 10:50  ANA NERY BERNAL CUNHA                       (a validar)
2026-07-16 12:50  JANETE FRANCO DEZIDERIO                     (ECG — caso de laudo)
2026-07-15 14:30  MELISSA VIEIRA FERREIRA DA SILVA            (a validar)
2026-07-15 12:50  JADE MIRELA CLARA CAETANO                   (a validar)
2026-07-13 12:30  ERICA KARINY (Preventivo)                   → Marcílio
2026-07-13 12:20  ERICA KARINY (Consulta)                     → Marcílio
```

Para cada caso: uso o `agendamento.medico_id` como fonte da verdade e alinho o `fin_lancamentos.medico_id`. Só executo o UPDATE em lote **depois** da sua conferência.

Observação sobre o caso ECG (Janete): esse tipo tem fluxo de repasse do **médico laudador**, diferente. Vou destacar e pedir sua confirmação separada antes de mexer.

## Ponto 3 — Investigação do fluxo que gravou o médico errado (sem corrigir código ainda)

O que já foi verificado:
- `lancamento-dialog.tsx`: faz prefetch do `medico_id` via `agendamento_id` — correto.
- `app.caixa.tsx` (linha 1091): busca `medico_id` do agendamento antes do RPC `fn_registrar_lancamento_e_caixa` — correto.
- `app.atendimento-ia.$agendamentoId.tsx`: não insere em `fin_lancamentos`.

Próximos passos da investigação (só leitura, sem alterar código):
1. Ler a definição SQL da RPC `fn_registrar_lancamento_e_caixa` para verificar se ela sobrescreve o `medico_id` recebido.
2. Buscar outros pontos que chamam essa RPC ou inserem direto em `fin_lancamentos` (checkin, atendimento-ia.index, agenda avulsa, boletos/convênios).
3. Cruzar `audit_log.user_email` dos 9 registros para ver se todos foram criados pelo mesmo usuário/fluxo (padrão de comportamento — ex.: pagamento antecipado + troca de médico depois).
4. Verificar se a hipótese é o pagamento ter sido feito pela tela de **Novo Lançamento avulso** (sem `agendamento_id` no momento) e depois vinculado — nesse caminho o `medico_id` pode ter vindo do usuário logado.

Ao final da investigação, entrego um resumo com: causa raiz identificada, arquivo/linha responsável, e a proposta de correção do código para você validar antes de qualquer edit.

## Ordem de execução

1. Aplicar Ponto 1 (2 UPDATEs pontuais) e confirmar visualmente na aba **Financeiro → Atendimentos** do Dr. Marcílio.
2. Apresentar tabela completa do Ponto 2, aguardar seu OK, e aplicar o UPDATE em lote nos casos aprovados.
3. Entregar relatório de investigação do Ponto 3 e, se identificar causa raiz, propor patch de código em plano separado.

## Fora de escopo
- Alterações nas outras duas clínicas (SFP e Policlínica) — mesmo que existam casos análogos, ficam para uma rodada dedicada, conforme regra 1.10.
- Alteração de código de frontend/RPC nesta rodada (só leitura/diagnóstico).
- Registros ECG/laudo (Janete) só depois da sua confirmação explícita.
