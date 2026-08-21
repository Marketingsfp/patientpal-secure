-- Sinalização manual de um paciente na Agenda.
--
-- A recepção precisa marcar um atendimento para que ele salte aos olhos na
-- lista (paciente que precisa de atenção, pendência combinada no balcão etc.).
-- A marca é POR AGENDAMENTO — some naturalmente quando o dia passa, em vez de
-- ficar grudada no cadastro do paciente para sempre.
--
-- `sinalizado_em` nulo = não sinalizado. As demais colunas só existem para
-- mostrar na tela quem sinalizou e quando.
alter table public.agendamentos
  add column if not exists sinalizado_em timestamptz,
  add column if not exists sinalizado_por uuid,
  add column if not exists sinalizado_por_nome text;

comment on column public.agendamentos.sinalizado_em is
  'Quando o atendimento foi sinalizado na Agenda. Nulo = não sinalizado.';
comment on column public.agendamentos.sinalizado_por is
  'Usuário que sinalizou o atendimento.';
comment on column public.agendamentos.sinalizado_por_nome is
  'Nome exibido de quem sinalizou (evita join na leitura da Agenda).';