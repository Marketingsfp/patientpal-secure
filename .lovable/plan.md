## O que está acontecendo (verificado no banco)

- Cadastro do prontuário **2656128** está correto: `TATIANE MAIA MARINS DOS SANTOS` (atualizado em 28/07).
- Os 2 agendamentos dela de 28/07 (CONSULTA e ECG) guardam uma **cópia antiga** do nome: `TATIANE MAIA MARIA DOS SANTOS`.
- Motivo: a tabela `agendamentos` tem uma coluna `paciente_nome` que é preenchida no momento do agendamento e **nunca é atualizada** quando o cadastro do paciente muda. A GR sai certa porque ela lê o cadastro atual.

Classificação: **inconsistência de dados** (cópia desatualizada), não erro de regra de negócio.

## Correção proposta

1. **Gatilho no banco**: quando o nome de um paciente for alterado, atualizar automaticamente o `paciente_nome` de todos os agendamentos ligados àquele paciente (`paciente_id`). Slots livres (sem paciente vinculado) não são tocados — a agenda usa esse campo para marcar "DISPONÍVEL".
2. **Correção do histórico**: uma única atualização que realinha os agendamentos cujo nome gravado está diferente do cadastro atual (inclui os 2 da Tatiane).
3. **Reforço na tela**: na Agenda, exibir o nome vindo do cadastro do paciente quando houver vínculo, usando o campo gravado apenas como fallback (slots livres e registros sem `paciente_id`).

## Impacto e riscos

- Áreas afetadas: **Agenda** (exibição e busca por nome) e a coluna `paciente_nome` de agendamentos.
- Não altera valores, faturamento, repasse, convênios ou Cartão Consulta.
- Reversível: o gatilho pode ser removido; a correção de histórico apenas alinha nomes ao cadastro oficial.

## Detalhe técnico

- Nova função + trigger `AFTER UPDATE OF nome ON public.pacientes` → `UPDATE public.agendamentos SET paciente_nome = NEW.nome WHERE paciente_id = NEW.id AND paciente_nome IS DISTINCT FROM NEW.nome`.
- Backfill: `UPDATE agendamentos a SET paciente_nome = p.nome FROM pacientes p WHERE a.paciente_id = p.id AND a.paciente_nome IS DISTINCT FROM p.nome`.
- Front: em `src/routes/_authenticated/app.agenda.tsx`, a query já seleciona relações; incluir `paciente:pacientes(nome)` e usar `a.paciente?.nome ?? a.paciente_nome` na normalização das linhas (linha ~2531), mantendo a lógica de slot livre intacta.

## Validação

- Conferir que os 2 agendamentos da Tatiane passam a exibir "MARINS" na agenda.
- Alterar o nome de um paciente de teste e confirmar reflexo imediato na agenda.
