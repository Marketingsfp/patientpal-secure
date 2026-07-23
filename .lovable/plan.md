## Regra: nova geração deve acrescentar slots abaixo dos existentes

Hoje, em **Horários médicos → Gerar agenda**, o sistema sempre monta os slots a partir do `hora_inicio` da disponibilidade semanal (ou do override do formulário) e ainda **apaga todos os slots livres** do intervalo antes de inserir. Resultado: quando o usuário roda a geração pela segunda vez em uma data que já tem fichas, os novos horários se sobrepõem aos antigos e a numeração é reembaralhada — foi exatamente o que aconteceu com o Dr. Carlos Eduardo.

A regra nova é: **para cada (médico, agenda, data), se já existir algum slot criado, os novos slots começam depois do fim do último slot daquela data, mantendo o intervalo escolhido**. Assim as fichas antigas continuam com sua numeração e as novas entram na sequência (61, 62, …).

### Escopo

- Somente a tela `Horários médicos` (`/app/disponibilidades`) — fluxo de "Gerar agenda".
- Vale para as 3 clínicas (o arquivo é único).
- Não mexe em bloqueios, agenda global, painel, etc.

### O que muda

1. **Buscar o "piso" por data/médico/agenda antes de gerar**
   - Para cada combinação (medico_id, agenda_id, data) que aparece na pré-visualização, consultar em `agendamentos` o maior `fim` já existente naquela data (qualquer status — agendado, pago, disponível, bloqueio), em horário local (America/Sao_Paulo).
   - Se existir, esse `max(fim)` vira o **novo `hora_inicio` efetivo** daquela data/médico/agenda. Se for maior que o `hora_fim` da janela, nada é gerado para o dia (toast informativo no final: "X datas já estavam completas").

2. **Preview respeita o piso**
   - O `slotsPreview` (usado no rodapé "Serão criados N horários") passa a refletir esse piso, para o usuário ver exatamente o que será acrescentado antes de confirmar.

3. **Parar de apagar slots livres do intervalo**
   - Remover o `DELETE` de slots `DISPONÍVEL` no intervalo. A proteção contra duplicata continua garantida pelo `unique index uq_agend_slot_vazio` + dedupe do lote — se algum slot novo colidir com um existente, o insert simplesmente ignora aquela linha (usar `upsert` com `onConflict` ignorado ou tratar erro por lote).
   - Isso preserva o comportamento pedido: os antigos permanecem, os novos ficam abaixo.

4. **Aviso na UI**
   - Adicionar uma linha curta abaixo do botão: *"Se a data já tiver horários criados, os novos serão adicionados após o último horário do dia."*

### Fora do escopo

- Não altero a lógica de numeração de fichas na Agenda (já está correta após o fix de timezone de ontem).
- Não mudo o comportamento quando não existem slots na data — continua igual (usa `hora_inicio` da disponibilidade/override).
- Não toco em bloqueios nem no fluxo de "regerar" manual.

### Detalhes técnicos

Arquivo: `src/routes/_authenticated/app.disponibilidades.tsx`.

- Novo `useQuery` (ou fetch dentro do `useMemo` assíncrono → melhor: fetch dentro de `gerarAgenda` + um estado `pisosPorChave` recomputado quando muda médico/intervalo) que retorna `Map<"medicoId|agendaId|YYYY-MM-DD" (local), "HH:MM">` com o maior `fim` local por chave, limitado ao intervalo `data_inicio`/`data_fim` e aos médicos alvo.
- Conversão UTC→local usando `Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })` — mesmo padrão já aplicado na Agenda.
- No `slotsPreview`, após montar `dsEfetivo`, ajustar `hora_inicio` para `max(hora_inicio, piso)` e descartar disponibilidades cuja janela ficou inválida.
- No `gerarAgenda`, remover o bloco `DELETE` e trocar o `insert` por `insert(..., { count: 'exact' })` tolerando o erro `23505` do índice único (log + continuar), ou pré-filtrar contra os slots existentes buscados no piso.

### Confirmação necessária

Antes de implementar, preciso confirmar duas coisas:

1. **Clínicas alvo**: aplico em todas as 3 clínicas (padrão global, já que o arquivo é único), ou é para restringir a alguma via feature flag?
2. **Piso considera qualquer slot ou só livres?** Minha proposta é considerar **qualquer slot** existente na data (agendado, pago, bloqueio, livre) — assim mesmo que só existam bloqueios ou fichas pagas no dia, os novos entram depois. Confirma?
