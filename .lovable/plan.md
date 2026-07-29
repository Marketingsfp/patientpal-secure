Objetivo: a desmarcação de um atendimento externo deve deixar a ficha exatamente como uma desmarcação comum — slot limpo, nada no financeiro, tudo apenas no histórico.

## Como funciona hoje
A ação "Desmarcar paciente / Liberar horário" limpa paciente, procedimento, observações, status, data de pagamento e orçamento, e remove os vínculos de itens de orçamento. Ela não limpa as marcações de atendimento externo (origem externa, clínica de origem, valor de origem) nem remove o lançamento gerado em Atendimentos do Financeiro. Por isso os três horários desmarcados continuam roxos na agenda e continuam aparecendo no Financeiro.

## O que será feito

1. Completar a limpeza na desmarcação
   - Na mesma ação de desmarcar, além do que já é limpo, zerar: origem externa, clínica de origem e valor de origem.
   - Remover o registro correspondente em Atendimentos do Financeiro quando ele for de atendimento externo.
   - Se o repasse desse atendimento já estiver pago, não apagar: avisar que é preciso estornar o repasse antes de liberar o horário (mesma lógica do bloqueio que já existe para atendimento pago).

2. Registrar no histórico
   - Antes de limpar, gravar uma nota no histórico da ficha com paciente, clínica de origem, procedimento e valor de repasse que foram desfeitos, além do usuário e data/hora.
   - O log de auditoria continua registrando as alterações normalmente.

3. Aplicar a mesma limpeza no cancelamento
   - Quando o agendamento externo for movido para "Cancelado", executar a mesma rotina, para não sobrar registro financeiro órfão por esse caminho.

4. Corrigir os três casos atuais (29/07, 13:50 / 13:55 / 14:00)
   - Limpar as marcações de atendimento externo nos três slots.
   - Remover os três lançamentos externos pendentes no Financeiro (repasse ainda não pago).
   - Registrar a correção no histórico de cada ficha.

5. Validação
   - Os três horários devem aparecer como livres e sem destaque roxo na agenda.
   - Nenhum deles deve aparecer em Financeiro > Atendimentos.
   - O histórico de cada ficha deve mostrar o que foi desfeito.

## Detalhes técnicos
- Nova função de servidor `limparAtendimentoExterno` em `src/lib/agenda/atendimento-externo.functions.ts`: valida `repasse_pago`, apaga a linha de `fin_atendimentos` com `forma_pagamento = 'externo'`, zera `origem_externa/origem_clinica_id/origem_clinica_nome/origem_valor` em `agendamentos` e insere a nota em `agendamento_historico_notas`.
- Chamada a partir de `remove` em `src/routes/_authenticated/app.agenda.tsx` (antes da limpeza atual) e a partir do fluxo de cancelamento em `src/lib/agenda/status-agendamento.functions.ts`.
- Correção dos registros existentes via operação de dados nos IDs `d2421c9a`, `822a77af` e `ba210e85`.