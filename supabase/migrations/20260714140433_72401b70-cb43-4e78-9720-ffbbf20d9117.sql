-- ALTA-14: nada no banco impedia salvar a triagem de enfermagem duas vezes
-- para o mesmo atendimento (nem uma trava client-side robusta contra
-- clique duplo). Confirmado (2026-07-14): 0 agendamentos com mais de uma
-- linha em triagens_enfermagem hoje, então o índice aplica limpo.
create unique index if not exists uq_triagens_enfermagem_agendamento
  on public.triagens_enfermagem (agendamento_id)
  where agendamento_id is not null;
