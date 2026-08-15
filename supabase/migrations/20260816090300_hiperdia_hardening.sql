-- Hiperdia — resolve o conflito de migrations e blinda a tabela em produção.
--
-- CONTEXTO
-- O módulo nasceu com DUAS migrations criando `public.hiperdia_registros`:
--
--   20260814162700_6cbb13aa-...  (gerada pelo Lovable) -> É A QUE ESTÁ APLICADA
--   20260814180000_hiperdia_registros.sql (escrita à mão, append-only)
--
-- A segunda nunca rodou: a tabela já existia, e `CREATE TABLE` sem IF NOT
-- EXISTS aborta. Quem confirma qual venceu é o `src/integrations/supabase/
-- types.ts`, gerado a partir do banco real: ele traz `medico_id` e
-- `registrado_por`, colunas que só existem na versão do Lovable.
--
-- O arquivo duplicado foi REMOVIDO do repositório junto com esta migration.
-- Isso era necessário não só por higiene: uma migration que aborta no meio
-- trava a fila do `supabase db push` e impede que as correções de segurança
-- seguintes cheguem a rodar.
--
-- Apagar o arquivo, porém, não muda nada no banco — a tabela frouxa continua
-- lá. É esta migration que a conserta, de forma forward-only (nunca reescrever
-- uma migration já aplicada).
--
-- O QUE ESTAVA FROUXO NA VERSÃO APLICADA
--   1. GRANT + policies de UPDATE e DELETE para qualquer `authenticated`:
--      qualquer membro da clínica podia alterar ou apagar uma aferição de
--      pressão/glicemia já registrada — um fato clínico datado.
--   2. Sem gatilho de auditoria: essa alteração não deixava rastro nenhum.
--   3. RLS só com `is_member(...)`: bastava pertencer à clínica. Não se
--      perguntava se a pessoa tem o módulo Hiperdia liberado no perfil.
--
-- ROLLBACK (no fim do arquivo, comentado).

-- ---------------------------------------------------------------------------
-- PASSO 1 — Semear os módulos novos em `perfil_permissoes`.
--
-- OBRIGATÓRIO ANTES DE TROCAR A RLS. `has_module_access` é fail-closed: perfil
-- sem linha configurada devolve false. Como 'hiperdia' e 'consulta-ia' são
-- chaves novas, NENHUM perfil tem linha para elas — trocar a policy sem semear
-- deixaria toda a equipe (menos admin) sem acesso a uma tela que hoje funciona.
--
-- Os defaults abaixo espelham src/lib/permissoes-presets.ts, e o bloco segue o
-- mesmo formato de 20260710135444_harden_module_permissions.sql. Perfis não
-- citados recebem 'none' explícito, como no original.
--
-- `do update` no conflito é intencional e seguro: as chaves são novas, então
-- não há configuração manual de administrador para sobrescrever.
-- ---------------------------------------------------------------------------
with modules(modulo) as (
  select unnest(array['hiperdia', 'consulta-ia']::text[])
), role_defaults(chave, regras) as (values
  ('medico',    '{"hiperdia":"write","consulta-ia":"write"}'::jsonb),
  ('enfermeiro','{"hiperdia":"write","consulta-ia":"write"}'::jsonb)
), desired as (
  select p.id perfil_id, m.modulo,
    case when p.chave = 'admin' then 'write'::public.modulo_acesso
         else coalesce(rd.regras ->> m.modulo, 'none')::public.modulo_acesso end acesso
  from public.perfis_acesso p
  cross join modules m
  left join role_defaults rd on rd.chave = p.chave
  where p.chave in ('admin','gestor','medico','recepcao','caixa','financeiro','enfermeiro')
)
insert into public.perfil_permissoes(perfil_id, modulo, acesso)
select perfil_id, modulo, acesso from desired
on conflict (perfil_id, modulo) do update set acesso = excluded.acesso;

-- ---------------------------------------------------------------------------
-- PASSO 2 — RLS estrita.
--
-- Troca `is_member` por `has_module_access`, que verifica as DUAS coisas:
-- vínculo ativo com a clínica E permissão do módulo no perfil. Admin passa
-- sempre (está embutido na função).
--
-- Usamos a assinatura de 4 argumentos — has_module_access(_user_id,
-- _clinica_id, _modulo, _nivel) — porque é a que o types.ts gerado a partir do
-- banco confirma existir em produção, e ela já tem GRANT EXECUTE para
-- `authenticated` (20260805141749).
--
-- UPDATE e DELETE deixam de ser livres: passam a exigir papel de admin da
-- clínica. Mantemos o GRANT no nível de tabela porque GRANT é por ROLE, não
-- por linha — revogá-lo de `authenticated` bloquearia também o admin, que é
-- `authenticated`. Quem barra o usuário comum é a policy.
--
-- A checagem de admin é escrita inline (EXISTS em clinica_memberships) em vez
-- de chamar `is_clinic_admin`: essa função não aparece no types.ts gerado do
-- banco, e não vale arriscar uma policy que não cria.
-- ---------------------------------------------------------------------------

-- Policies da versão aplicada (Lovable).
drop policy if exists hr_select on public.hiperdia_registros;
drop policy if exists hr_insert on public.hiperdia_registros;
drop policy if exists hr_update on public.hiperdia_registros;
drop policy if exists hr_delete on public.hiperdia_registros;
-- Policies da versão à mão, caso algum ambiente a tenha aplicado.
drop policy if exists hiperdia_member_select on public.hiperdia_registros;
drop policy if exists hiperdia_member_insert on public.hiperdia_registros;

alter table public.hiperdia_registros enable row level security;

create policy hiperdia_modulo_select on public.hiperdia_registros
  for select to authenticated
  using (public.has_module_access(auth.uid(), clinica_id, 'hiperdia', 'read'));

create policy hiperdia_modulo_insert on public.hiperdia_registros
  for insert to authenticated
  with check (public.has_module_access(auth.uid(), clinica_id, 'hiperdia', 'write'));

-- Correção de aferição gravada: só admin da clínica, e o gatilho de auditoria
-- do PASSO 3 guarda o valor anterior.
create policy hiperdia_admin_update on public.hiperdia_registros
  for update to authenticated
  using (exists (
    select 1 from public.clinica_memberships cm
    where cm.user_id = auth.uid()
      and cm.clinica_id = hiperdia_registros.clinica_id
      and cm.ativo = true
      and cm.role::text = 'admin'
  ))
  with check (exists (
    select 1 from public.clinica_memberships cm
    where cm.user_id = auth.uid()
      and cm.clinica_id = hiperdia_registros.clinica_id
      and cm.ativo = true
      and cm.role::text = 'admin'
  ));

create policy hiperdia_admin_delete on public.hiperdia_registros
  for delete to authenticated
  using (exists (
    select 1 from public.clinica_memberships cm
    where cm.user_id = auth.uid()
      and cm.clinica_id = hiperdia_registros.clinica_id
      and cm.ativo = true
      and cm.role::text = 'admin'
  ));

-- ---------------------------------------------------------------------------
-- PASSO 3 — Auditoria.
--
-- Mesma convenção das outras 18 tabelas sensíveis do projeto. Grava em
-- public.audit_log quem fez, quando, e o antes/depois. Sem isto, uma aferição
-- alterada era indistinguível de uma aferição correta.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_audit_hiperdia_registros on public.hiperdia_registros;
create trigger trg_audit_hiperdia_registros
  after insert or update or delete on public.hiperdia_registros
  for each row execute function public.fn_audit_trigger();

-- ---------------------------------------------------------------------------
-- PASSO 4 — Travas contra erro grosseiro de digitação.
--
-- Estavam na versão à mão e se perderam com ela. O objetivo não é diagnosticar,
-- é impedir que "1400" vire histórico clínico no lugar de "140".
--
-- Criadas como NOT VALID de propósito: valem para tudo que for gravado ou
-- alterado daqui em diante, mas NÃO varrem as linhas já existentes. Assim a
-- migration não pode abortar por causa de um registro antigo fora da faixa —
-- exatamente o tipo de falha no meio do caminho que trava a fila de migrations.
-- Para validar o histórico depois de conferir os dados:
--   ALTER TABLE public.hiperdia_registros VALIDATE CONSTRAINT hiperdia_sistolica_chk;
--
-- O bloco é idempotente: rodar de novo não duplica constraint.
-- ---------------------------------------------------------------------------
do $hiperdia_checks$
declare
  c record;
begin
  for c in
    select * from (values
      ('hiperdia_sistolica_chk',
       'pressao_sistolica IS NULL OR pressao_sistolica BETWEEN 40 AND 300'),
      ('hiperdia_diastolica_chk',
       'pressao_diastolica IS NULL OR pressao_diastolica BETWEEN 20 AND 200'),
      ('hiperdia_glicemia_jejum_chk',
       'glicemia_jejum IS NULL OR glicemia_jejum BETWEEN 10 AND 1000'),
      ('hiperdia_glicemia_pos_chk',
       'glicemia_pos_prandial IS NULL OR glicemia_pos_prandial BETWEEN 10 AND 1000'),
      ('hiperdia_peso_chk',
       'peso IS NULL OR peso BETWEEN 0.5 AND 500'),
      -- Pressão só faz sentido como par: "140/—" não é uma aferição.
      ('hiperdia_pressao_par_chk',
       '(pressao_sistolica IS NULL) = (pressao_diastolica IS NULL)'),
      ('hiperdia_observacoes_chk',
       'observacoes IS NULL OR length(observacoes) <= 2000')
    ) as t(nome, expressao)
  loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.hiperdia_registros'::regclass
        and conname = c.nome
    ) then
      execute format(
        'alter table public.hiperdia_registros add constraint %I check (%s) not valid',
        c.nome, c.expressao
      );
    end if;
  end loop;
end $hiperdia_checks$;

comment on table public.hiperdia_registros is
  'Aferições de pressão, glicemia e peso (módulo Hiperdia). RLS por módulo via has_module_access. UPDATE/DELETE restritos ao admin da clínica e auditados em audit_log.';

-- ---------------------------------------------------------------------------
-- COMO CONFERIR DEPOIS DE APLICAR (somente leitura)
--
--   select policyname, cmd, qual from pg_policies
--    where schemaname = 'public' and tablename = 'hiperdia_registros';
--   -- esperado: hiperdia_modulo_select, hiperdia_modulo_insert,
--   --           hiperdia_admin_update, hiperdia_admin_delete
--
--   select tgname from pg_trigger
--    where tgrelid = 'public.hiperdia_registros'::regclass and not tgisinternal;
--   -- esperado: trg_audit_hiperdia_registros
--
--   select pa.chave, pp.modulo, pp.acesso
--     from public.perfil_permissoes pp
--     join public.perfis_acesso pa on pa.id = pp.perfil_id
--    where pp.modulo in ('hiperdia','consulta-ia') order by pa.chave, pp.modulo;
--
-- TESTE FUNCIONAL: com um usuário de perfil `medico` da Menino Jesus, abrir a
-- ficha de um paciente — o card Hiperdia deve listar e aceitar novo registro.
-- Com um usuário `recepcao`, o card não deve trazer linha nenhuma.
--
-- ROLLBACK (reabre o acesso — não recomendado)
--   drop policy if exists hiperdia_modulo_select on public.hiperdia_registros;
--   drop policy if exists hiperdia_modulo_insert on public.hiperdia_registros;
--   drop policy if exists hiperdia_admin_update on public.hiperdia_registros;
--   drop policy if exists hiperdia_admin_delete on public.hiperdia_registros;
--   drop trigger if exists trg_audit_hiperdia_registros on public.hiperdia_registros;
--   create policy hr_select on public.hiperdia_registros for select to authenticated
--     using (public.is_member(auth.uid(), clinica_id));
--   create policy hr_insert on public.hiperdia_registros for insert to authenticated
--     with check (public.is_member(auth.uid(), clinica_id));
-- ---------------------------------------------------------------------------
