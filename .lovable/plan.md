## Objetivo

No diálogo "Atendimento externo", o campo **GR da origem** sai de cena (as GRs, antigas e novas, não têm numeração) e o **Valor na origem** passa a ser obrigatório, já que é ele que alimenta o repasse do médico.

## O que muda

**1. Diálogo (`src/components/agenda/atendimento-externo-dialog.tsx`)**
- Remove o campo "GR da origem" e seu estado.
- "Valor na origem" ocupa a largura do formulário, marcado com `*` e validado: precisa ser maior que zero, senão mostra aviso e não salva.
- Continua a lista suspensa de clínicas + opção "Outra clínica (digitar)".

**2. Regra de negócio (`src/lib/agenda/atendimento-externo.functions.ts`)**
- Deixa de exigir GR; passa a exigir `origem_valor > 0`.
- `origem_gr_numero` vira opcional no tipo de entrada (mantido para não quebrar registros já gravados) e deixa de ser gravado em novos registros.
- A observação do `fin_atendimentos` passa de `EXTERNO — GR 123 · Clínica` para `EXTERNO — <nome da clínica de origem>`.
- `valor_medico` continua igual ao valor informado; `valor_clinica` segue 0 e nada entra no caixa nem gera NFS-e.

**3. Identificação sem GR**
O atendimento externo continua rastreável pela combinação clínica de origem + paciente + data + procedimento, que já é gravada no agendamento e no `fin_atendimentos`.

## Detalhes técnicos

- Nenhuma migração: a coluna `origem_gr_numero` permanece na tabela `agendamentos` com os dados históricos, apenas deixa de ser preenchida.
- Relatório financeiro de atendimentos externos: se ele exibir coluna de GR, ela será removida da apresentação (verificação feita durante a implementação).
