-- ============================================================================
-- Agenda — exclusão de horário VAGO liberada para Recepção e Caixa
-- Data: 2026-09-04
--
-- PROBLEMA
--   A policy `agend_delete` da tabela `agendamentos` exigia
--   `can_manage_clinica()`, que só aceita os papéis 'admin' e 'gestor'.
--   Recepção e caixa levavam erro de permissão do banco ao tentar apagar
--   qualquer linha da agenda — inclusive um horário totalmente vazio.
--
-- O QUE MUDA
--   Passa a poder apagar quem:
--     a) é admin/gestor da clínica (como antes, sem restrição); OU
--     b) tem EDIÇÃO no módulo 'agenda' (recepção, caixa, etc.) E a linha é um
--        horário realmente vago.
--
--   "Vago" aqui é conferido no banco, não na tela: sem paciente vinculado E
--   sem nenhum rastro financeiro ou clínico pendurado no agendamento.
--
-- POR QUE A TRAVA FINANCEIRA É NECESSÁRIA
--   Na conferência feita nos dados de produção nesta data existiam 12
--   lançamentos financeiros e 14 NFS-e apontando para agendamentos SEM
--   paciente (horários que foram desmarcados depois de já terem recebido).
--   As chaves estrangeiras são ON DELETE SET NULL: apagar essas linhas não
--   dava erro, apagava em silêncio o vínculo entre o dinheiro/a nota e o
--   atendimento. Com esta policy, essas linhas ficam recusadas para a
--   recepção e continuam visíveis para o gestor resolver.
--
-- AUDITORIA
--   A exclusão continua registrada: o gatilho `trg_audit_agendamentos`
--   dispara em DELETE e grava a linha apagada.
--
-- SEGURO DE RODAR MAIS DE UMA VEZ.
-- ============================================================================

-- 1) Função que responde: este agendamento é um horário realmente vago?
create or replace function public.agendamento_slot_vazio(_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
        exists (select 1 from public.agendamentos a
                 where a.id = _id and a.paciente_id is null)
    and not exists (select 1 from public.fin_atendimentos t            where t.agendamento_id = _id)
    and not exists (select 1 from public.fin_lancamentos t             where t.agendamento_id = _id)
    and not exists (select 1 from public.nfse t                        where t.agendamento_id = _id)
    and not exists (select 1 from public.nfse_agendamentos t           where t.agendamento_id = _id)
    and not exists (select 1 from public.prontuarios t                 where t.agendamento_id = _id)
    and not exists (select 1 from public.anamnese_respostas t          where t.agendamento_id = _id)
    and not exists (select 1 from public.fisio_sessoes t               where t.agendamento_id = _id)
    and not exists (select 1 from public.odonto_evolucoes t            where t.agendamento_id = _id)
    and not exists (select 1 from public.orcamento_itens t             where t.agendamento_id = _id)
    and not exists (select 1 from public.agendamento_orcamento_itens t where t.agendamento_id = _id)
$$;

comment on function public.agendamento_slot_vazio(uuid) is
  'true quando o agendamento nao tem paciente vinculado nem nenhum rastro '
  'financeiro/clinico. Usado pela policy agend_delete para liberar a limpeza '
  'da grade por recepcao e caixa sem abrir mao da auditoria.';

grant execute on function public.agendamento_slot_vazio(uuid) to authenticated;

-- 2) Policy de exclusão: gestão sem restrição, demais perfis só horário vago.
drop policy if exists agend_delete on public.agendamentos;

create policy agend_delete on public.agendamentos
  for delete to authenticated
  using (
    public.can_manage_clinica(auth.uid(), clinica_id)
    or (
      public.has_module_access(auth.uid(), clinica_id, 'agenda', 'write')
      and public.agendamento_slot_vazio(id)
    )
  );

-- ============================================================================
-- CONFERÊNCIA (só leitura — pode rodar depois para ver se ficou certo)
-- ============================================================================

-- 2.1) A policy nova está no ar?
select polname, pg_get_expr(polqual, polrelid) as regra
from pg_policy
where polrelid = 'public.agendamentos'::regclass and polname = 'agend_delete';

-- 2.2) Quantos horários vagos ficaram liberados e quantos ficaram protegidos
--      pela trava financeira (estes últimos são caso para o gestor olhar).
select
  count(*) filter (where public.agendamento_slot_vazio(a.id))       as vagos_liberados,
  count(*) filter (where not public.agendamento_slot_vazio(a.id))   as vagos_travados_por_rastro
from public.agendamentos a
where a.paciente_id is null;

-- 2.3) Quais perfis de cada clínica têm edição na Agenda hoje (é isso que
--      define quem ganha o botão de excluir horário vago).
select c.nome as clinica, pa.chave as perfil, pp.acesso
from public.perfil_permissoes pp
join public.perfis_acesso pa on pa.id = pp.perfil_id
join public.clinicas c on c.id = pa.clinica_id
where pp.modulo = 'agenda'
order by c.nome, pa.chave;
