-- ALTA-07: nada no banco impedia salvar um agendamento com fim <= inicio.
-- A validação "fim > inicio" só existia no client (submit clássico) —
-- qualquer outro caminho de escrita (RPC, script, edição direta) podia
-- gravar um intervalo invertido/zerado sem ninguém perceber.
-- Confirmado (2026-07-14): 0 linhas violam esta regra hoje, então a
-- constraint valida limpo contra os dados existentes.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_agendamentos_fim_apos_inicio') then
    alter table public.agendamentos
      add constraint chk_agendamentos_fim_apos_inicio check (fim > inicio);
  end if;
end $$;
