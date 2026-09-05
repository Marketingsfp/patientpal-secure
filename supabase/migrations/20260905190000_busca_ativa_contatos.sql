-- ============================================================================
-- BUSCA ATIVA — HISTÓRICO DE CONTATO
-- ============================================================================
--
-- A tela Sessões e Manutenções já sabia QUEM sumiu. O que faltava era a outra
-- metade do trabalho da recepção: o que já foi tentado com cada um. Sem esse
-- registro, três recepcionistas ligam para o mesmo paciente na mesma semana e
-- ninguém sabe que ele já disse que desistiu.
--
-- Por que uma tabela nova, e não uma coluna no paciente ou no agendamento:
--
--   1. o contato é um EVENTO repetido — ligou dia 5, mandou mensagem dia 9,
--      reagendou dia 12. Uma coluna guardaria só o último e apagaria a
--      insistência, que é justamente o que a coordenação quer medir;
--   2. o contato pode não ter agendamento nenhum do outro lado (o paciente
--      sumiu, é esse o ponto), então não há linha de agendamento onde pendurar;
--   3. o histórico precisa sobreviver ao paciente ser reagendado, ao pacote ser
--      concluído e à limpeza de 180 dias do `audit_log`.
--
-- O que esta tabela NÃO é: ela não muda a situação clínica nem financeira de
-- ninguém. Marcar "Paciente desistiu" não cancela pacote, não gera cobrança e
-- não some com a linha do relatório — é anotação de recepção, e a decisão de
-- encerrar um tratamento continua sendo de quem tem alçada para isso.
-- ============================================================================

create table if not exists public.busca_ativa_contatos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,

  -- De qual natureza era a linha do relatório quando o contato foi feito.
  -- Guardado junto porque um mesmo paciente pode estar em pacote de fisio E em
  -- ciclo de manutenção ao mesmo tempo, e "já liguei para ele" precisa dizer
  -- sobre qual dos dois.
  origem text not null default 'ciclo' check (origem in ('pacote', 'ciclo')),

  -- Nome do procedimento como estava impresso na linha. Texto, e não id: o
  -- relatório de ciclo casa o procedimento por NOME normalizado, não por
  -- chave, e o histórico tem que continuar legível se o cadastro for renomeado.
  procedimento text not null default '',

  -- Os quatro desfechos que a recepção usa no balcão, mais 'outro' para o que
  -- não couber. Ficam como CHECK e não como enum do Postgres porque acrescentar
  -- um valor a um enum em produção exige transação própria; aqui é um ALTER
  -- simples do CHECK.
  resultado text not null check (
    resultado in ('reagendado', 'nao_atende', 'mensagem_enviada', 'desistiu', 'outro')
  ),

  observacao text,

  -- Quem registrou. `default auth.uid()` para que a tela não precise mandar o
  -- id e não consiga registrar em nome de outra pessoa.
  registrado_por uuid default auth.uid() references auth.users(id),

  criado_em timestamptz not null default now()
);

comment on table public.busca_ativa_contatos is
  'Histórico de tentativas de contato da busca ativa (tela Sessões e Manutenções). Anotação de recepção: não altera situação clínica nem financeira.';
comment on column public.busca_ativa_contatos.resultado is
  'reagendado | nao_atende | mensagem_enviada | desistiu | outro. Marcar "desistiu" NÃO encerra pacote nem cancela cobrança.';

-- A consulta da tela é sempre "os contatos destes pacientes, mais recente
-- primeiro". O índice cobre exatamente isso.
create index if not exists idx_busca_ativa_contatos_paciente
  on public.busca_ativa_contatos (clinica_id, paciente_id, criado_em desc);

-- Painel de acompanhamento da coordenação: "quantos contatos foram feitos no
-- mês, e com que desfecho".
create index if not exists idx_busca_ativa_contatos_periodo
  on public.busca_ativa_contatos (clinica_id, criado_em desc);

alter table public.busca_ativa_contatos enable row level security;

-- ----------------------------------------------------------------------------
-- Permissão: os mesmos três módulos que já podem ABRIR o relatório
-- ----------------------------------------------------------------------------
-- `fn_relatorio_sessoes` libera a leitura por 'relatorios', 'financeiro' ou
-- 'recepcao'. O histórico de contato acompanha a mesma régua: quem enxerga a
-- lista de faltosos é quem trabalha o resgate. Fechar mais do que isso deixaria
-- a recepção vendo a lista e sem conseguir anotar o que fez com ela.
drop policy if exists bac_select on public.busca_ativa_contatos;
drop policy if exists bac_insert on public.busca_ativa_contatos;
drop policy if exists bac_delete on public.busca_ativa_contatos;

create policy bac_select on public.busca_ativa_contatos for select to authenticated
  using (
    public.has_module_access(auth.uid(), clinica_id, 'relatorios', 'read')
    or public.has_module_access(auth.uid(), clinica_id, 'financeiro', 'read')
    or public.has_module_access(auth.uid(), clinica_id, 'recepcao', 'read')
  );

create policy bac_insert on public.busca_ativa_contatos for insert to authenticated
  with check (
    (
      public.has_module_access(auth.uid(), clinica_id, 'relatorios', 'write')
      or public.has_module_access(auth.uid(), clinica_id, 'financeiro', 'write')
      or public.has_module_access(auth.uid(), clinica_id, 'recepcao', 'write')
    )
    -- O paciente tem que ser da mesma clínica do registro. Sem isto alguém
    -- poderia pendurar uma anotação no paciente de outra unidade e lê-la de
    -- volta por join.
    and exists (
      select 1 from public.pacientes p
      where p.id = paciente_id and p.clinica_id = busca_ativa_contatos.clinica_id
    )
  );

-- Sem policy de UPDATE de propósito: registro de contato é histórico. Anotação
-- errada se corrige com um novo registro explicando, do mesmo jeito que a
-- recepção faz no papel — reescrever o passado apagaria a prova de quem ligou.
--
-- Apagar fica com quem gerencia a clínica, para o caso de teste ou de registro
-- lançado no paciente errado.
create policy bac_delete on public.busca_ativa_contatos for delete to authenticated
  using (public.can_manage_clinica(auth.uid(), clinica_id));
