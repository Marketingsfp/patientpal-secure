-- 1) updated_at nas quatro tabelas novas
drop trigger if exists trg_fisio_avaliacoes_upd on public.fisio_avaliacoes;
drop trigger if exists trg_fisio_marcacoes_upd  on public.fisio_marcacoes;
drop trigger if exists trg_fisio_pacotes_upd    on public.fisio_pacotes;
drop trigger if exists trg_fisio_sessoes_upd    on public.fisio_sessoes;

create trigger trg_fisio_avaliacoes_upd before update on public.fisio_avaliacoes
  for each row execute function public.update_updated_at_column();
create trigger trg_fisio_marcacoes_upd before update on public.fisio_marcacoes
  for each row execute function public.update_updated_at_column();
create trigger trg_fisio_pacotes_upd before update on public.fisio_pacotes
  for each row execute function public.update_updated_at_column();
create trigger trg_fisio_sessoes_upd before update on public.fisio_sessoes
  for each row execute function public.update_updated_at_column();

-- 2) Sincronia da presença com a agenda.
create or replace function public.fn_fisio_sync_sessao_agendamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.status is distinct from old.status then
    update public.fisio_sessoes s
       set status = case new.status
                      when 'realizado'  then 'realizada'
                      when 'faltou'     then 'faltou'
                      when 'cancelado'  then 'pendente'
                      else 'agendada'
                    end,
           realizada_em = case
                            when new.status = 'realizado' then coalesce(s.realizada_em, now())
                            else null
                          end,
           agendamento_id = case when new.status = 'cancelado' then null else s.agendamento_id end,
           updated_at = now()
     where s.agendamento_id = new.id;
  end if;
  return new;
end
$fn$;

revoke all on function public.fn_fisio_sync_sessao_agendamento() from public, anon;

drop trigger if exists trg_fisio_sync_sessao on public.agendamentos;
create trigger trg_fisio_sync_sessao
  after update of status on public.agendamentos
  for each row execute function public.fn_fisio_sync_sessao_agendamento();

-- 3) Auditoria nas tabelas clínicas de fisioterapia
do $$
declare t text;
begin
  foreach t in array array['fisio_avaliacoes','fisio_marcacoes','fisio_sessoes'] loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$I', t);
    execute format(
      'create trigger trg_audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.fn_audit_trigger()',
      t);
  end loop;
end $$;