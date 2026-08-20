-- ============================================================================
-- Módulo Fisioterapia — mapa corporal e pacotes de sessões
-- ============================================================================
-- Espelha a estrutura que já existe em Odontologia (odonto_prontuarios /
-- odonto_dentes / odonto_evolucoes), com duas diferenças deliberadas:
--
--  1) As policies já nascem com `has_module_access(auth.uid(), clinica_id,
--     'fisioterapia', …)` em vez de `is_member(...)`. Conferido no banco em
--     20/08/2026: nenhuma policy usa `has_module_access` ainda — todas as
--     tabelas clínicas (inclusive odonto e prontuarios) param em `is_member`,
--     então o bloqueio por módulo existe apenas no menu e um usuário do caixa
--     lê prontuário odontológico direto pela API REST (HANDOFF.md, item 3).
--     A migration 20260710135444_harden_module_permissions.sql, que prometia
--     corrigir isso, NÃO está aplicada no banco de produção. Tabela nova não
--     deve nascer com o buraco, mas consertar as antigas continua pendente.
--
--     Atenção à assinatura: a função viva é
--     `has_module_access(_user_id uuid, _clinica_id uuid, _modulo text,
--     _nivel text)` — quatro argumentos, começando pelo usuário. A versão de
--     três argumentos que aparece naquela migration não existe no banco.
--
--  2) O controle de presença das sessões não é digitado duas vezes: a sessão
--     aponta para o agendamento e um gatilho em `agendamentos` reflete o
--     status. A agenda continua sendo a única fonte da verdade sobre o que
--     aconteceu no dia.
--
-- O dinheiro NÃO ganha estrutura paralela: o pacote referencia o orçamento e o
-- item de orçamento já existentes, como a Odontologia faz com `orcamento_itens.dentes`.
--
-- ATENÇÃO ao aplicar do zero: os gatilhos deste módulo (updated_at, sincronia
-- com a agenda e auditoria) NÃO estão neste arquivo. Eles foram aplicados pelo
-- agente do Lovable e ficaram registrados em
-- 20260820101921_a1391a4e-f1df-4041-a99e-36efdd52361e.sql, cujo timestamp é
-- ANTERIOR ao deste arquivo. Numa reexecução da pasta em ordem cronológica
-- aquele arquivo rodaria antes destas tabelas existirem e falharia — rode este
-- primeiro. O banco de produção já está com os dois aplicados (20/08/2026).
-- ============================================================================

-- ── Tipos ───────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'fisio_marcacao_tipo') then
    create type public.fisio_marcacao_tipo as enum (
      'dor','edema','limitacao','contratura','parestesia','cicatriz','deformidade','outro'
    );
  end if;
end $$;

-- ── Avaliação (uma linha por paciente/clínica) ──────────────────────────────

create table if not exists public.fisio_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null,
  paciente_id uuid not null,
  queixa_principal text,
  historia text,
  diagnostico_funcional text,
  objetivos text,
  plano_tratamento text,
  observacoes text,
  profissional_id uuid,
  ultima_atualizacao_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, paciente_id)
);

create index if not exists idx_fisio_avaliacoes_pac
  on public.fisio_avaliacoes (clinica_id, paciente_id);

-- ── Marcações no mapa corporal ──────────────────────────────────────────────
-- Uma linha por marcação feita pelo profissional. O "estado atual" de uma
-- região é a linha mais recente dela, mesma regra do odontograma — assim o
-- histórico nunca é sobrescrito.

create table if not exists public.fisio_marcacoes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null,
  paciente_id uuid not null,
  -- Código da região no SVG (ex.: 'ombro', 'lombar', 'joelho'). Fica como
  -- texto livre de propósito: o mapa corporal vai ganhar regiões novas com o
  -- tempo e uma enum obrigaria migration a cada ajuste do desenho.
  regiao text not null,
  lado text not null default 'C',
  vista text not null default 'frente',
  tipo public.fisio_marcacao_tipo not null default 'dor',
  -- Escala visual analógica de dor (0 a 10).
  intensidade smallint,
  queixa text,
  tratamento text,
  data date not null default current_date,
  profissional_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fisio_marcacoes_lado_check check (lado in ('D','E','C')),
  constraint fisio_marcacoes_vista_check check (vista in ('frente','costas')),
  constraint fisio_marcacoes_intensidade_check
    check (intensidade is null or (intensidade >= 0 and intensidade <= 10))
);

create index if not exists idx_fisio_marcacoes_pac
  on public.fisio_marcacoes (clinica_id, paciente_id, data desc);

-- ── Pacotes de sessões ──────────────────────────────────────────────────────

create table if not exists public.fisio_pacotes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null,
  paciente_id uuid not null,
  descricao text not null,
  procedimento_id uuid,
  -- Vínculo com o financeiro que já existe. ON DELETE SET NULL para que
  -- excluir um orçamento nunca apague o histórico clínico do pacote.
  orcamento_id uuid references public.orcamentos(id) on delete set null,
  orcamento_item_id uuid references public.orcamento_itens(id) on delete set null,
  total_sessoes smallint not null,
  valor_total numeric not null default 0,
  data_inicio date not null default current_date,
  status text not null default 'ativo',
  profissional_id uuid,
  observacoes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fisio_pacotes_total_check check (total_sessoes > 0 and total_sessoes <= 200),
  constraint fisio_pacotes_status_check check (status in ('ativo','concluido','cancelado'))
);

create index if not exists idx_fisio_pacotes_pac
  on public.fisio_pacotes (clinica_id, paciente_id, data_inicio desc);
create index if not exists idx_fisio_pacotes_status
  on public.fisio_pacotes (clinica_id, status);

-- ── Sessões do pacote ───────────────────────────────────────────────────────

create table if not exists public.fisio_sessoes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null,
  pacote_id uuid not null references public.fisio_pacotes(id) on delete cascade,
  numero smallint not null,
  agendamento_id uuid references public.agendamentos(id) on delete set null,
  data_prevista date,
  status text not null default 'pendente',
  evolucao text,
  dor_antes smallint,
  dor_depois smallint,
  profissional_id uuid,
  realizada_em timestamptz,
  registrado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fisio_sessoes_status_check
    check (status in ('pendente','agendada','realizada','faltou','cancelada')),
  constraint fisio_sessoes_dor_antes_check
    check (dor_antes is null or (dor_antes >= 0 and dor_antes <= 10)),
  constraint fisio_sessoes_dor_depois_check
    check (dor_depois is null or (dor_depois >= 0 and dor_depois <= 10)),
  unique (pacote_id, numero)
);

create index if not exists idx_fisio_sessoes_pacote
  on public.fisio_sessoes (pacote_id, numero);
-- Um agendamento não pode contar como sessão de dois pacotes ao mesmo tempo —
-- seria consumo dobrado do pacote do paciente.
create unique index if not exists uq_fisio_sessoes_agendamento
  on public.fisio_sessoes (agendamento_id) where agendamento_id is not null;

-- ── Grants e RLS ────────────────────────────────────────────────────────────

grant select, insert, update, delete on public.fisio_avaliacoes to authenticated;
grant select, insert, update, delete on public.fisio_marcacoes  to authenticated;
grant select, insert, update, delete on public.fisio_pacotes    to authenticated;
grant select, insert, update, delete on public.fisio_sessoes    to authenticated;
grant all on public.fisio_avaliacoes to service_role;
grant all on public.fisio_marcacoes  to service_role;
grant all on public.fisio_pacotes    to service_role;
grant all on public.fisio_sessoes    to service_role;

alter table public.fisio_avaliacoes enable row level security;
alter table public.fisio_marcacoes  enable row level security;
alter table public.fisio_pacotes    enable row level security;
alter table public.fisio_sessoes    enable row level security;

-- Tabelas com `clinica_id` próprio: policy direta pelo módulo.
do $policy$
declare t text; prefix text;
begin
  foreach t in array array['fisio_avaliacoes','fisio_marcacoes','fisio_pacotes'] loop
    prefix := replace(t,'fisio_','f_');
    execute format('drop policy if exists %I on public.%I', prefix||'_select', t);
    execute format('drop policy if exists %I on public.%I', prefix||'_insert', t);
    execute format('drop policy if exists %I on public.%I', prefix||'_update', t);
    execute format('drop policy if exists %I on public.%I', prefix||'_delete', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_module_access(auth.uid(), clinica_id, ''fisioterapia'', ''read''))',
      prefix||'_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_module_access(auth.uid(), clinica_id, ''fisioterapia'', ''write''))',
      prefix||'_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.has_module_access(auth.uid(), clinica_id, ''fisioterapia'', ''write'')) with check (public.has_module_access(auth.uid(), clinica_id, ''fisioterapia'', ''write''))',
      prefix||'_update', t);
    -- Apagar registro clínico continua sendo ato de gestor, mesma função que
    -- `prontuarios` e `odonto_dentes` usam hoje no banco vivo. O uso normal é
    -- mudar o status, não excluir.
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_manage_clinica(auth.uid(), clinica_id))',
      prefix||'_delete', t);
  end loop;
end
$policy$;

-- `fisio_sessoes` também carrega `clinica_id`, mas exige que o pacote-pai seja
-- da mesma clínica: sem isso alguém poderia inserir uma sessão apontando para
-- o pacote de outra clínica e ler a evolução por join.
drop policy if exists f_sessoes_select on public.fisio_sessoes;
drop policy if exists f_sessoes_insert on public.fisio_sessoes;
drop policy if exists f_sessoes_update on public.fisio_sessoes;
drop policy if exists f_sessoes_delete on public.fisio_sessoes;

create policy f_sessoes_select on public.fisio_sessoes for select to authenticated
  using (
    public.has_module_access(auth.uid(), clinica_id, 'fisioterapia', 'read')
    and exists (
      select 1 from public.fisio_pacotes p
      where p.id = fisio_sessoes.pacote_id and p.clinica_id = fisio_sessoes.clinica_id
    )
  );
create policy f_sessoes_insert on public.fisio_sessoes for insert to authenticated
  with check (
    public.has_module_access(auth.uid(), clinica_id, 'fisioterapia', 'write')
    and exists (
      select 1 from public.fisio_pacotes p
      where p.id = fisio_sessoes.pacote_id and p.clinica_id = fisio_sessoes.clinica_id
    )
  );
create policy f_sessoes_update on public.fisio_sessoes for update to authenticated
  using (public.has_module_access(auth.uid(), clinica_id, 'fisioterapia', 'write'))
  with check (
    public.has_module_access(auth.uid(), clinica_id, 'fisioterapia', 'write')
    and exists (
      select 1 from public.fisio_pacotes p
      where p.id = fisio_sessoes.pacote_id and p.clinica_id = fisio_sessoes.clinica_id
    )
  );
create policy f_sessoes_delete on public.fisio_sessoes for delete to authenticated
  using (public.can_manage_clinica(auth.uid(), clinica_id));

-- ── updated_at ──────────────────────────────────────────────────────────────

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

-- ── Sincronia com a agenda ──────────────────────────────────────────────────
-- Quando o agendamento vinculado a uma sessão muda de status, a sessão
-- acompanha. É SECURITY DEFINER porque quem mexe na agenda é a recepção, que
-- normalmente não tem o módulo de fisioterapia liberado — sem isso a policy
-- de UPDATE filtraria a linha e a presença simplesmente não seria marcada,
-- silenciosamente.

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
           -- Só carimba a data/hora na primeira vez que vira realizada.
           realizada_em = case
                            when new.status = 'realizado' then coalesce(s.realizada_em, now())
                            else null
                          end,
           -- Agendamento cancelado devolve a sessão para o pacote: ela volta a
           -- ser "pendente" e some o vínculo, para poder ser remarcada.
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

-- ── Auditoria ───────────────────────────────────────────────────────────────
-- Mesmas tabelas clínicas que odonto_prontuarios / odonto_evolucoes já têm.

do $$
declare t text;
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_audit_trigger'
  ) then
    foreach t in array array['fisio_avaliacoes','fisio_marcacoes','fisio_sessoes'] loop
      execute format('drop trigger if exists trg_audit_%1$s on public.%1$I', t);
      execute format(
        'create trigger trg_audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.fn_audit_trigger()',
        t);
    end loop;
  end if;
end $$;
