## Objetivo

Permitir que um orçamento composto **apenas por procedimentos do tipo "Laboratório"** seja agendado de uma só vez, ocupando apenas **uma ficha** na agenda — em vez de marcar o paciente em vários horários, um por exame.

## Banco

Migração (uma transação):

- `agendamentos.orcamento_id uuid NULL REFERENCES public.orcamentos(id) ON DELETE SET NULL`
- Índice em `agendamentos(orcamento_id)`.
- Nenhuma mudança em RLS (a coluna herda as policies da tabela).

Sem alteração em `orcamentos` — o vínculo é 1 orçamento → N agendamentos (caso o paciente refaça), porém na prática 1↔1.

## UI — Diálogo "Marcar paciente" (`app.agenda`)

Acima dos campos atuais, novo campo opcional **"Nº do orçamento"**:

1. Input numérico + botão "Buscar".
2. Ao buscar, server fn `getOrcamentoParaAgendar({ numero })` retorna:
   - dados do orçamento (paciente, total, status);
   - itens com `procedimento_id`, nome e `tipo`;
   - validação: **todos** os itens precisam ter `tipo` = "LABORATÓRIO" (case/acento-insensitive). Se algum item não for laboratório → erro "Este fluxo é válido apenas para orçamentos 100% de laboratório."
   - bloqueia se status do orçamento for `cancelado` ou se já existir agendamento ativo vinculado.
3. Quando válido:
   - Preenche automaticamente **paciente** (read-only, com aviso de que veio do orçamento).
   - Preenche **procedimento** com texto consolidado: `"Laboratório (N exames): EX1, EX2, …"` (sem somar duração — usa o tempo padrão de uma ficha, como o usuário pediu).
   - Exibe lista compacta dos exames inclusos (apenas leitura, informativa).
   - Mantém a ficha única já selecionada na grade.
4. Ao salvar, grava `agendamentos.orcamento_id = <id>` além dos campos normais.

Botão "Limpar orçamento" volta o diálogo ao modo manual.

## Visualização na agenda

- Na ficha agendada, exibir um badge pequeno **"ORÇ #00123"** ao lado do nome do paciente quando `orcamento_id` estiver presente.
- Tooltip lista os exames do orçamento.
- No popover/edição da ficha, link "Ver orçamento" abre a tela de orçamentos filtrada por aquele número (rota existente).

## Pagamento

Mantém-se **separado**, conforme escolhido. Nada muda no caixa/recepção — o orçamento continua sendo quitado pelo fluxo atual de orçamentos. O vínculo serve só para:

- rastrear que aquele atendimento veio do orçamento X;
- evitar marcar o paciente em vários horários;
- referência cruzada em relatórios futuros (fora deste escopo).

## Server functions novas (em `src/lib/agenda.functions.ts` ou `orcamentos.functions.ts`)

- `getOrcamentoParaAgendar({ numero, clinicaId })` — valida tipo laboratório de todos os itens, retorna DTO leve.
- Atualização da função de criar agendamento existente para aceitar `orcamento_id` opcional.

## Tipos / código

- `routeTree.gen.ts` regenera sozinho.
- Sem mudanças em RLS, sem mudanças em `medico_agendas` / disponibilidades.
- Detecção do tipo "Laboratório" usa o campo `procedimentos.tipo` (string já existente, comparada via `strip_accents`+`upper`).

## Fora do escopo

- Não cria ficha de tempo proporcional à quantidade de exames (usa 1 ficha padrão).
- Não muda fluxo de pagamento.
- Não trata orçamentos mistos (laboratório + outros) — exibe erro e instrui o usuário a desmembrar.
- Sem alterações em WhatsApp / impressão de comprovante (pode ser feito depois).

Posso seguir?
