-- ALTA-09: anamnese_respostas.agendamento_id tinha ON DELETE CASCADE —
-- excluir um agendamento antigo apagava junto TODAS as respostas de
-- anamnese vinculadas, sem aviso e sem log (perda definitiva de dado
-- clínico). As outras tabelas que referenciam agendamentos (fin_lancamentos,
-- nfse, orcamento_itens) já usam ON DELETE SET NULL — preserva o registro,
-- só desvincula. anamnese_respostas.agendamento_id já é nullable e a linha
-- também guarda paciente_id, então a resposta continua rastreável ao
-- paciente mesmo sem o vínculo à consulta específica.
alter table public.anamnese_respostas
  drop constraint anamnese_respostas_agendamento_id_fkey;

alter table public.anamnese_respostas
  add constraint anamnese_respostas_agendamento_id_fkey
  foreign key (agendamento_id) references public.agendamentos(id) on delete set null;
