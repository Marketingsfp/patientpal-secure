-- Permissão por pessoa (exceção ao perfil)
--
-- POR QUE ESTA TABELA EXISTE
-- Até aqui o acesso era decidido só pelo CARGO: quem é "medico" via o que
-- todo médico vê, quem é "recepcao" via o que toda recepção vê. Não havia
-- como liberar um módulo para UMA pessoa sem liberar para o cargo inteiro,
-- nem fechar um módulo para UMA pessoa sem fechar para todas as colegas.
--
-- Cada linha aqui é uma EXCEÇÃO: "para esta pessoa, neste módulo, vale isto,
-- e não o que está no perfil dela". Quem não tem linha nenhuma continua
-- valendo exatamente o perfil — é por isso que criar a tabela não muda o
-- acesso de ninguém no dia em que ela nasce.
--
-- A tela (Configurações › Perfis de Acesso, aba "Por pessoa") grava só o que
-- ficou DIFERENTE do perfil; voltar um módulo ao padrão apaga a linha, em vez
-- de gravar o mesmo valor do cargo. Assim, mudar o perfil depois continua
-- alcançando quem nunca foi personalizado naquele módulo.

create table if not exists public.usuario_permissoes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  -- Sem FK para auth.users: o padrão do resto do schema (usuario_medicos,
  -- clinica_memberships) é guardar o user_id solto e resolver o nome via
  -- public.profiles.
  user_id uuid not null,
  modulo text not null,
  acesso public.modulo_acesso not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usuario_permissoes_pessoa_modulo_unico unique (clinica_id, user_id, modulo)
);

-- O acesso é lido a cada carregamento de tela, sempre por (clínica, pessoa).
create index if not exists idx_usuario_permissoes_pessoa
  on public.usuario_permissoes (clinica_id, user_id);

alter table public.usuario_permissoes enable row level security;

-- LEITURA: a própria pessoa precisa ler as exceções dela (é o que o app
-- consulta para montar o menu). Quem administra a clínica lê as de todo mundo,
-- porque é quem configura a tela.
drop policy if exists "Pessoa ve as proprias excecoes" on public.usuario_permissoes;
create policy "Pessoa ve as proprias excecoes"
  on public.usuario_permissoes
  for select
  using (
    (user_id = auth.uid() and public.is_member(auth.uid(), clinica_id))
    or public.can_manage_clinica(auth.uid(), clinica_id)
  );

-- ESCRITA: só quem administra a clínica. Ninguém amplia o próprio acesso.
drop policy if exists "Gestores criam excecoes" on public.usuario_permissoes;
create policy "Gestores criam excecoes"
  on public.usuario_permissoes
  for insert
  with check (public.can_manage_clinica(auth.uid(), clinica_id));

drop policy if exists "Gestores editam excecoes" on public.usuario_permissoes;
create policy "Gestores editam excecoes"
  on public.usuario_permissoes
  for update
  using (public.can_manage_clinica(auth.uid(), clinica_id))
  with check (public.can_manage_clinica(auth.uid(), clinica_id));

drop policy if exists "Gestores removem excecoes" on public.usuario_permissoes;
create policy "Gestores removem excecoes"
  on public.usuario_permissoes
  for delete
  using (public.can_manage_clinica(auth.uid(), clinica_id));

-- Mesmos gatilhos de perfil_permissoes: carimbo de alteração e trilha de
-- auditoria. Mudança de acesso tem que deixar rastro de quem mexeu e quando.
drop trigger if exists trg_usuario_permissoes_updated on public.usuario_permissoes;
create trigger trg_usuario_permissoes_updated
  before update on public.usuario_permissoes
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_audit_usuario_permissoes on public.usuario_permissoes;
create trigger trg_audit_usuario_permissoes
  after insert or delete or update on public.usuario_permissoes
  for each row execute function public.fn_audit_trigger();

comment on table public.usuario_permissoes is
  'Exceções de acesso por pessoa. Módulo sem linha aqui segue o perfil (cargo) do usuário.';
