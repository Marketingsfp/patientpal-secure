-- ALTA-04: nem o prontuário nem o registro financeiro do atendimento
-- (fin_atendimentos) guardavam qual agendamento os originou. Se o paciente
-- teve duas consultas no mesmo dia, não havia como provar qual prontuário
-- (ou qual cobrança) era de qual consulta — só paciente_id + data (sem
-- hora), que não distingue duas consultas no mesmo dia.
alter table public.prontuarios
  add column if not exists agendamento_id uuid references public.agendamentos(id) on delete set null;

alter table public.fin_atendimentos
  add column if not exists agendamento_id uuid references public.agendamentos(id) on delete set null;

create index if not exists idx_prontuarios_agendamento_id on public.prontuarios(agendamento_id);
create index if not exists idx_fin_atendimentos_agendamento_id on public.fin_atendimentos(agendamento_id);
