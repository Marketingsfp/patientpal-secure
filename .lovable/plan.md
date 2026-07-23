## Escopo

Aplicar em **Odontologia** (nas 3 clínicas, regra global) duas mudanças no vínculo orçamento ↔ agendamento na Agenda.

## Como está hoje (confirmado por leitura)

- `orcamento_itens` já tem `status_financeiro` (`pendente`/`pago`/…) e `pago_em`.
- `agendamento_orcamento_itens` guarda o vínculo item×agendamento.
- Na Agenda (`app.agenda.tsx`, linhas ~3410-3428), um item é considerado "consumido" **se existir link para qualquer agendamento não cancelado** — mesmo que ninguém tenha pago. Ou seja, um item marcado como agendado só volta a ficar disponível se o agendamento for **cancelado** (status = `cancelado`).
- Não há hoje nenhum aviso quando o mesmo item é agendado uma segunda vez (o unique é por `agendamento_id + orcamento_item_id`, então o mesmo item pode ser vinculado a agendamentos diferentes sem trava).

## Regra 1 — Item só é "consumido" quando pago

Reescrever o filtro de itens consumidos no seletor de orçamento da Agenda para considerar consumido **apenas quando o item foi pago**. Pago =
- `orcamento_itens.status_financeiro = 'pago'` **ou**
- o agendamento vinculado tem `fin_lancamentos` de receita confirmado (mesma regra do `pagamento-status.ts`, que já é a definição usada em toda a plataforma).

Efeito: se o agendamento for desmarcado, remarcado, marcado como faltou, ou simplesmente estiver pendente de pagamento, o item volta a aparecer disponível para novo agendamento. Somente itens efetivamente pagos deixam de aparecer.

## Regra 2 — Aviso ao reagendar item ainda não pago

Antes de salvar um novo agendamento que vincula itens de um orçamento, verificar se cada item já tem outro agendamento ativo (não cancelado) e ainda não pago. Se sim, exibir um **AlertDialog** com a lista:

> "Este paciente já está agendado para **[serviço]** com **Dr(a). [nome]** em **dd/mm/aaaa às HH:MM** (ficha nº **[N]**) e ainda não pagou. Deseja mesmo criar um novo agendamento?"

Botões: "Cancelar" e "Agendar mesmo assim". Se confirmar, segue o fluxo normal (novo vínculo, o item passa a ter dois agendamentos ativos até que um seja cancelado ou pago).

Ao editar um agendamento existente, o próprio agendamento é ignorado da checagem (não avisa contra si mesmo).

## Arquivos afetados

- `src/routes/_authenticated/app.agenda.tsx` — trocar o filtro de consumidos (juntar `agendamento_orcamento_itens` + `orcamento_itens.status_financeiro` + `fin_lancamentos`) e adicionar o AlertDialog de duplicidade no `handleSalvar`.

## Fora do escopo

- Orçamentos de Laboratório / Consultas / outros — a regra fica restrita ao fluxo de Odontologia (é onde o vínculo item×agendamento é usado hoje na prática); pode ser estendida depois se pedirem.
- Nenhuma mudança de schema/RLS/migração; só ajuste de leitura na Agenda.

## Validação

- Typecheck (`tsgo`).
- Teste manual no preview: agendar item de orçamento odonto → cancelar agendamento → confirmar que o item volta a aparecer; agendar de novo sem pagar → confirmar que o aviso aparece com médico/data/hora/ficha; pagar → confirmar que some do seletor.