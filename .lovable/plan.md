## Problema

No diálogo **Dividir orçamento** (`src/components/agenda/dividir-orcamento-dialog.tsx`), o campo **Início** é um `<input type="datetime-local">` livre. Isso permite agendar em qualquer dia/hora, mesmo fora da grade real do profissional/recurso (folga, horário de almoço, slot já ocupado, fora do expediente).

## Solução proposta

Trocar o campo livre por um **seletor de slots disponíveis** baseado na agenda real do profissional/recurso selecionado, igual ao usado no formulário de novo agendamento (`app.agenda.tsx`).

### Fluxo

1. Usuário escolhe o **profissional/recurso** do bloco (já filtrado por serviço, como corrigido na rodada anterior).
2. Aparece um campo **Data** (date picker — só dias com agenda ativa).
3. Aparece um `Select` **Horário disponível** que lista apenas os slots livres daquele profissional/recurso naquela data, respeitando:
   - dias e horários da agenda configurada (`medico_agendas` / `enfermagem_horarios`),
   - duração do serviço,
   - agendamentos já existentes (sem conflito),
   - intervalos/folgas.
4. Se ninguém tem slot na data, mostra aviso "Sem horários disponíveis nessa data — escolha outro dia".
5. A duração passa a vir do cadastro do serviço (somando blocos), mas continua editável.

### Detalhes técnicos

- Reaproveitar a função/RPC que a agenda principal já usa para calcular slots livres (verificar `app.agenda.tsx` — existe lógica de `slots disponíveis` / `proximos horarios`). Se houver RPC tipo `buscar_slots_disponiveis`, chamar com `(medico_id|recurso_id, data, duracao)`.
- Carregar slots sob demanda quando `medico_id` + `data` + `duracao` estiverem definidos no bloco.
- Cache local por chave `${profissional}-${data}-${duracao}` para evitar recalcular ao trocar entre blocos.
- Manter a sequência automática dos blocos: ao escolher o slot do bloco 1, sugerir o próximo slot livre para o bloco 2, e assim por diante (mas usuário pode trocar manualmente).
- Revalidação no `handleSalvar`: além da checagem profissional×serviço, conferir que o horário ainda está livre no momento do insert (refetch rápido) para evitar corrida.

### Fallback

Se o profissional/recurso não tiver agenda configurada no sistema, manter o campo `datetime-local` livre como hoje, com aviso "Sem agenda configurada — horário livre".

## Arquivos

- `src/components/agenda/dividir-orcamento-dialog.tsx` — substituir campo Início, adicionar campo Data + Select de horário, lógica de carregamento de slots, revalidação no salvar.
- Sem mudanças de schema. Reuso da RPC/lógica já existente em `app.agenda.tsx`.

## Confirmação

Antes de implementar: confirma que quer **bloquear** horários fora da agenda (não dá pra salvar), ou prefere **apenas avisar** e ainda permitir forçar (override)?
