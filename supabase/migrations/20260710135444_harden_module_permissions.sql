-- Centraliza autorização por módulo e faz as políticas críticas respeitarem
-- a mesma matriz exibida em Perfis de Acesso.

create or replace function public.is_clinic_admin(_clinica_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.clinica_memberships cm
    where cm.user_id = auth.uid()
      and cm.clinica_id = _clinica_id
      and cm.ativo = true
      and cm.role = 'admin'
  );
$$;

create or replace function public.has_module_access(
  _clinica_id uuid,
  _modulo text,
  _required public.modulo_acesso default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.clinica_memberships cm
    left join public.perfis_acesso pa
      on pa.clinica_id = cm.clinica_id
     and pa.chave = cm.role::text
     and pa.ativo = true
    left join public.perfil_permissoes pp
      on pp.perfil_id = pa.id
     and pp.modulo = _modulo
    where cm.user_id = auth.uid()
      and cm.clinica_id = _clinica_id
      and cm.ativo = true
      and (
        cm.role = 'admin'
        or pp.acesso = 'write'
        or (_required = 'read' and pp.acesso = 'read')
      )
  );
$$;

revoke all on function public.is_clinic_admin(uuid) from public, anon;
revoke all on function public.has_module_access(uuid, text, public.modulo_acesso) from public, anon;
grant execute on function public.is_clinic_admin(uuid) to authenticated;
grant execute on function public.has_module_access(uuid, text, public.modulo_acesso) to authenticated;

-- Somente ADMIN administra a matriz. Gestor continua podendo gerenciar a
-- operação da clínica, mas não elevar privilégios.
drop policy if exists "Gestores podem criar perfis" on public.perfis_acesso;
drop policy if exists "Gestores podem editar perfis" on public.perfis_acesso;
drop policy if exists "Gestores podem remover perfis não-sistema" on public.perfis_acesso;
create policy "Admins podem criar perfis" on public.perfis_acesso
  for insert to authenticated with check (public.is_clinic_admin(clinica_id));
create policy "Admins podem editar perfis" on public.perfis_acesso
  for update to authenticated
  using (public.is_clinic_admin(clinica_id))
  with check (public.is_clinic_admin(clinica_id));
create policy "Admins podem remover perfis não-sistema" on public.perfis_acesso
  for delete to authenticated using (public.is_clinic_admin(clinica_id) and sistema = false);

drop policy if exists "Gestores podem criar permissões" on public.perfil_permissoes;
drop policy if exists "Gestores podem editar permissões" on public.perfil_permissoes;
drop policy if exists "Gestores podem remover permissões" on public.perfil_permissoes;
create policy "Admins podem criar permissões" on public.perfil_permissoes
  for insert to authenticated with check (exists (
    select 1 from public.perfis_acesso p
    where p.id = perfil_id and public.is_clinic_admin(p.clinica_id)
  ));
create policy "Admins podem editar permissões" on public.perfil_permissoes
  for update to authenticated
  using (exists (
    select 1 from public.perfis_acesso p
    where p.id = perfil_id and public.is_clinic_admin(p.clinica_id)
  ))
  with check (exists (
    select 1 from public.perfis_acesso p
    where p.id = perfil_id and public.is_clinic_admin(p.clinica_id)
  ));
create policy "Admins podem remover permissões" on public.perfil_permissoes
  for delete to authenticated using (exists (
    select 1 from public.perfis_acesso p
    where p.id = perfil_id and public.is_clinic_admin(p.clinica_id)
  ));

-- Garante os sete perfis de sistema para todas as clínicas.
insert into public.perfis_acesso (clinica_id, chave, nome, descricao, sistema, ativo)
select c.id, v.chave, v.nome, v.descricao, true, true
from public.clinicas c
cross join (values
  ('admin','ADMIN','Acesso total ao sistema.'),
  ('gestor','GESTOR','Gestão operacional sem administração de segurança.'),
  ('medico','MÉDICO','Atuação clínica e acesso aos próprios fluxos assistenciais.'),
  ('recepcao','RECEPÇÃO','Agenda, recepção, pacientes e atendimento operacional.'),
  ('caixa','CAIXA','Recebimentos e operação diária de caixa.'),
  ('financeiro','FINANCEIRO','Gestão financeira, fiscal e relatórios.'),
  ('enfermeiro','ENFERMEIRO','Triagem e acompanhamento de enfermagem.')
) as v(chave,nome,descricao)
on conflict (clinica_id,chave) do update
set nome=excluded.nome, descricao=excluded.descricao, sistema=true, ativo=true;

-- Um único conjunto de defaults, equivalente a src/lib/permissoes-presets.ts.
with modules(modulo) as (
  select unnest(array[
    'agenda','checkin','caixa','chat','clientes','dashboard','fluxo','orcamentos','recepcao',
    'triagem-enfermagem','cartao-beneficios','painel','documentos','atendimento-multiplo',
    'atendimento-ia','crm','alertas-enfermagem','consulta-rapida','nina','odontologia',
    'prontuarios','anamneses','exames-resultados','mkt-leads','campanhas','mkt-envios',
    'mkt-landing','mkt-segmentos','equipe','especialidades','disponibilidades',
    'prontuario-modelos','perfis','unidades','medicos','procedimentos','planos','estoque',
    'modelos-documentos','clinicas','tipos-servico','enfermagem-recursos','hr-ponto',
    'hr-contratos','hr-ferias','hr-holerites','treinamentos','lms-admin','cargos','financeiro',
    'funcionarios','relatorios','auditoria','setores','boletos','contratos','nfse',
    'integration-secrets','lgpd','painel-executivo','perfil-proprio'
  ]::text[])
), role_defaults(chave, regras) as (values
  ('gestor', '{"dashboard":"write","agenda":"write","fluxo":"write","clientes":"write","chat":"write","checkin":"read","recepcao":"read","orcamentos":"read","caixa":"read","financeiro":"write","boletos":"read","contratos":"read","nfse":"read","relatorios":"write","auditoria":"read","lgpd":"read","equipe":"write","hr-contratos":"read","hr-ponto":"read","hr-ferias":"read","hr-holerites":"read","treinamentos":"read","cargos":"read","setores":"read","unidades":"read","medicos":"read","especialidades":"read","procedimentos":"read","disponibilidades":"write","prontuario-modelos":"read","modelos-documentos":"read","planos":"read","estoque":"read","crm":"read","campanhas":"read","mkt-leads":"read","consulta-rapida":"read","alertas-enfermagem":"read","cartao-beneficios":"read","painel":"read","perfil-proprio":"write","painel-executivo":"write","atendimento-multiplo":"read","tipos-servico":"read","enfermagem-recursos":"read"}'::jsonb),
  ('medico', '{"agenda":"write","atendimento-ia":"write","exames-resultados":"read","consulta-rapida":"read","perfil-proprio":"write","prontuario-modelos":"read","odontologia":"write","prontuarios":"write","anamneses":"write","documentos":"write","clientes":"read","chat":"write","atendimento-multiplo":"write"}'::jsonb),
  ('recepcao', '{"agenda":"write","recepcao":"write","clientes":"write","fluxo":"write","orcamentos":"write","consulta-rapida":"read","perfil-proprio":"write","checkin":"write","painel":"write","chat":"write","cartao-beneficios":"read","caixa":"write","procedimentos":"read","atendimento-multiplo":"write","tipos-servico":"read"}'::jsonb),
  ('caixa', '{"caixa":"write","clientes":"read","recepcao":"read","financeiro":"read","consulta-rapida":"read","perfil-proprio":"write","boletos":"write","nfse":"read","contratos":"read","cartao-beneficios":"read","chat":"write"}'::jsonb),
  ('financeiro', '{"financeiro":"write","caixa":"read","relatorios":"write","orcamentos":"read","clientes":"read","cartao-beneficios":"write","perfil-proprio":"write","boletos":"write","nfse":"write","contratos":"write","planos":"read","hr-holerites":"read","hr-contratos":"read","auditoria":"read","integration-secrets":"read","chat":"write","dashboard":"read"}'::jsonb),
  ('enfermeiro', '{"triagem-enfermagem":"write","alertas-enfermagem":"write","agenda":"read","clientes":"read","consulta-rapida":"read","atendimento-ia":"read","perfil-proprio":"write","anamneses":"write","prontuarios":"read","estoque":"read","documentos":"read","chat":"write","orcamentos":"write","atendimento-multiplo":"write","enfermagem-recursos":"write"}'::jsonb)
), desired as (
  select p.id perfil_id, m.modulo,
    case when p.chave='admin' then 'write'::public.modulo_acesso
         else coalesce(rd.regras ->> m.modulo, 'none')::public.modulo_acesso end acesso
  from public.perfis_acesso p
  cross join modules m
  left join role_defaults rd on rd.chave=p.chave
  where p.chave in ('admin','gestor','medico','recepcao','caixa','financeiro','enfermeiro')
)
insert into public.perfil_permissoes(perfil_id,modulo,acesso)
select perfil_id,modulo,acesso from desired
on conflict(perfil_id,modulo) do update set acesso=excluded.acesso;

-- Policies críticas: SELECT exige leitura; mutações exigem edição.
drop policy if exists agend_select on public.agendamentos;
drop policy if exists agend_insert on public.agendamentos;
drop policy if exists agend_update on public.agendamentos;
drop policy if exists agend_delete on public.agendamentos;
create policy agend_select on public.agendamentos for select to authenticated
  using (public.has_module_access(clinica_id,'agenda','read'));
create policy agend_insert on public.agendamentos for insert to authenticated
  with check (public.has_module_access(clinica_id,'agenda','write'));
create policy agend_update on public.agendamentos for update to authenticated
  using (public.has_module_access(clinica_id,'agenda','write'))
  with check (public.has_module_access(clinica_id,'agenda','write'));
create policy agend_delete on public.agendamentos for delete to authenticated
  using (public.has_module_access(clinica_id,'agenda','write'));

drop policy if exists pacientes_member_select on public.pacientes;
drop policy if exists pacientes_staff_insert on public.pacientes;
drop policy if exists pacientes_staff_update on public.pacientes;
drop policy if exists pacientes_manager_delete on public.pacientes;
create policy pacientes_member_select on public.pacientes for select to authenticated
  using (public.has_module_access(clinica_id,'clientes','read'));
create policy pacientes_staff_insert on public.pacientes for insert to authenticated
  with check (public.has_module_access(clinica_id,'clientes','write'));
create policy pacientes_staff_update on public.pacientes for update to authenticated
  using (public.has_module_access(clinica_id,'clientes','write'))
  with check (public.has_module_access(clinica_id,'clientes','write'));
create policy pacientes_manager_delete on public.pacientes for delete to authenticated
  using (public.is_clinic_admin(clinica_id));

drop policy if exists pron_select on public.prontuarios;
drop policy if exists pron_insert on public.prontuarios;
drop policy if exists pron_update on public.prontuarios;
drop policy if exists pron_delete on public.prontuarios;
create policy pron_select on public.prontuarios for select to authenticated
  using (public.has_module_access(clinica_id,'prontuarios','read'));
create policy pron_insert on public.prontuarios for insert to authenticated
  with check (public.has_module_access(clinica_id,'prontuarios','write'));
create policy pron_update on public.prontuarios for update to authenticated
  using (public.has_module_access(clinica_id,'prontuarios','write'))
  with check (public.has_module_access(clinica_id,'prontuarios','write'));
create policy pron_delete on public.prontuarios for delete to authenticated
  using (public.is_clinic_admin(clinica_id));

do $policy$
declare t text; prefix text;
begin
  foreach t in array array['fin_categorias','fin_contas','fin_empresas','fin_lancamentos','fin_notas_pacientes','fin_atendimentos'] loop
    prefix := case t
      when 'fin_categorias' then 'fin_cat'
      when 'fin_contas' then 'fin_contas'
      when 'fin_empresas' then 'fin_emp'
      when 'fin_lancamentos' then 'fin_lanc'
      when 'fin_notas_pacientes' then 'fin_notas'
      else 'fin_atend' end;
    execute format('drop policy if exists %I on public.%I',prefix||'_select',t);
    execute format('drop policy if exists %I on public.%I',prefix||'_insert',t);
    execute format('drop policy if exists %I on public.%I',prefix||'_update',t);
    execute format('drop policy if exists %I on public.%I',prefix||'_delete',t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_module_access(clinica_id,''financeiro'',''read''))',prefix||'_select',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_module_access(clinica_id,''financeiro'',''write''))',prefix||'_insert',t);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_module_access(clinica_id,''financeiro'',''write'')) with check (public.has_module_access(clinica_id,''financeiro'',''write''))',prefix||'_update',t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_module_access(clinica_id,''financeiro'',''write''))',prefix||'_delete',t);
  end loop;
end $policy$;

drop policy if exists pag_select on public.pagamentos;
drop policy if exists pag_insert on public.pagamentos;
drop policy if exists pag_update on public.pagamentos;
drop policy if exists pag_delete on public.pagamentos;
create policy pag_select on public.pagamentos for select to authenticated using (
  public.has_module_access(clinica_id,'caixa','read') or public.has_module_access(clinica_id,'financeiro','read'));
create policy pag_insert on public.pagamentos for insert to authenticated with check (
  public.has_module_access(clinica_id,'caixa','write') or public.has_module_access(clinica_id,'financeiro','write'));
create policy pag_update on public.pagamentos for update to authenticated
  using (public.has_module_access(clinica_id,'caixa','write') or public.has_module_access(clinica_id,'financeiro','write'))
  with check (public.has_module_access(clinica_id,'caixa','write') or public.has_module_access(clinica_id,'financeiro','write'));
create policy pag_delete on public.pagamentos for delete to authenticated
  using (public.has_module_access(clinica_id,'financeiro','write'));

drop policy if exists ps_select on public.pagamento_splits;
drop policy if exists ps_insert on public.pagamento_splits;
drop policy if exists ps_update on public.pagamento_splits;
drop policy if exists ps_delete on public.pagamento_splits;
create policy ps_select on public.pagamento_splits for select to authenticated using (
  public.has_module_access(clinica_id,'caixa','read') or public.has_module_access(clinica_id,'financeiro','read'));
create policy ps_insert on public.pagamento_splits for insert to authenticated with check (
  public.has_module_access(clinica_id,'caixa','write') or public.has_module_access(clinica_id,'financeiro','write'));
create policy ps_update on public.pagamento_splits for update to authenticated
  using (public.has_module_access(clinica_id,'caixa','write') or public.has_module_access(clinica_id,'financeiro','write'))
  with check (public.has_module_access(clinica_id,'caixa','write') or public.has_module_access(clinica_id,'financeiro','write'));
create policy ps_delete on public.pagamento_splits for delete to authenticated
  using (public.has_module_access(clinica_id,'financeiro','write'));

drop policy if exists cx_mov_select on public.caixa_movimentos;
drop policy if exists cx_mov_insert on public.caixa_movimentos;
drop policy if exists cx_mov_update on public.caixa_movimentos;
drop policy if exists cx_mov_delete on public.caixa_movimentos;
create policy cx_mov_select on public.caixa_movimentos for select to authenticated using (
  public.has_module_access(clinica_id,'caixa','read') or public.has_module_access(clinica_id,'financeiro','read'));
create policy cx_mov_insert on public.caixa_movimentos for insert to authenticated with check (
  user_id=auth.uid() and public.has_module_access(clinica_id,'caixa','write'));
create policy cx_mov_update on public.caixa_movimentos for update to authenticated
  using ((user_id=auth.uid() and public.has_module_access(clinica_id,'caixa','write')) or public.has_module_access(clinica_id,'financeiro','write'))
  with check (public.has_module_access(clinica_id,'caixa','write') or public.has_module_access(clinica_id,'financeiro','write'));
create policy cx_mov_delete on public.caixa_movimentos for delete to authenticated
  using (public.has_module_access(clinica_id,'financeiro','write'));

drop policy if exists cx_sess_select on public.caixa_sessoes;
drop policy if exists cx_sess_insert on public.caixa_sessoes;
drop policy if exists cx_sess_update on public.caixa_sessoes;
drop policy if exists cx_sess_delete on public.caixa_sessoes;
create policy cx_sess_select on public.caixa_sessoes for select to authenticated using (
  public.has_module_access(clinica_id,'caixa','read') or public.has_module_access(clinica_id,'financeiro','read'));
create policy cx_sess_insert on public.caixa_sessoes for insert to authenticated with check (
  user_id=auth.uid() and public.has_module_access(clinica_id,'caixa','write'));
create policy cx_sess_update on public.caixa_sessoes for update to authenticated
  using ((user_id=auth.uid() and public.has_module_access(clinica_id,'caixa','write')) or public.has_module_access(clinica_id,'financeiro','write'))
  with check (public.has_module_access(clinica_id,'caixa','write') or public.has_module_access(clinica_id,'financeiro','write'));
create policy cx_sess_delete on public.caixa_sessoes for delete to authenticated
  using (public.has_module_access(clinica_id,'financeiro','write'));
