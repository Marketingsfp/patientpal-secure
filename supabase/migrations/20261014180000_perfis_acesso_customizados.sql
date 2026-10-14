-- Perfis de acesso customizados (ex.: CARTÃO BENEFÍCIOS).
--
-- O perfil de cada pessoa continua gravado em clinica_memberships.role, que
-- é uma lista fechada (enum app_role) lida por dezenas de políticas RLS
-- (has_role / has_any_role). Um perfil customizado, por isso, sempre tem um
-- PERFIL BASE de sistema (decisão do dono em 14/10/2026):
--   * a matriz de módulos (perfil_permissoes) vem do perfil customizado;
--   * onde o banco ou o código pergunta o NOME do perfil, a pessoa conta como
--     o perfil base — o trigger abaixo grava role = perfil_base.
--
-- Base nas definições que estão EM PRODUÇÃO em 14/10/2026 (conferidas com
-- pg_get_functiondef). Atenção: has_module_access de produção tem 4
-- parâmetros (_user_id, _clinica_id, _modulo, _nivel text); a versão de 3
-- parâmetros de 20260710135444_harden_module_permissions.sql não existe no
-- banco real. Esta migration NÃO aplica aquela.
--
-- Nada muda para quem já existe: a coluna nova nasce vazia e, vazia, todas
-- as funções se comportam exatamente como antes (perfil pela chave = role).
--
-- Rollback:
--   drop trigger trg_membership_perfil_customizado on public.clinica_memberships;
--   drop trigger trg_perfis_acesso_custom_imutavel on public.perfis_acesso;
--   recriar has_module_access / pode_escrever_modulo / can_manage_medicos com
--   "chave = role::text" (versões citadas acima);
--   alter table public.clinica_memberships drop column perfil_acesso_id;
--   alter table public.perfis_acesso drop constraint perfis_acesso_custom_base_chk,
--     drop constraint perfis_acesso_custom_chave_chk, drop column perfil_base;

-- 1. Perfil base -------------------------------------------------------------
alter table public.perfis_acesso
  add column if not exists perfil_base public.app_role;

-- Perfil customizado precisa de base, e a base nunca é ADMIN: admin pula a
-- matriz inteira, então um "customizado baseado em admin" teria acesso total
-- sem que a tela de Perfis mostrasse isso.
alter table public.perfis_acesso
  add constraint perfis_acesso_custom_base_chk
  check (sistema or (perfil_base is not null and perfil_base <> 'admin'));

-- Chave do customizado: minúsculas/números/_ e nunca o nome de um perfil de
-- sistema (has_module_access resolve perfil de sistema pela chave).
alter table public.perfis_acesso
  add constraint perfis_acesso_custom_chave_chk
  check (
    sistema
    or (
      chave ~ '^[a-z][a-z0-9_]{1,39}$'
      and chave not in (
        'admin', 'gestor', 'medico', 'enfermeiro', 'recepcao',
        'caixa', 'financeiro', 'supervisor', 'telefonia'
      )
    )
  );

-- Chave, unidade, base e a marca "sistema" de um customizado não mudam depois
-- de criado: quem está nele foi gravado com role = perfil_base, e trocar a
-- base por baixo deixaria o vínculo dessas pessoas incoerente.
create or replace function public.tg_perfis_acesso_custom_imutavel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not old.sistema and (
    new.sistema
    or new.chave is distinct from old.chave
    or new.clinica_id is distinct from old.clinica_id
    or new.perfil_base is distinct from old.perfil_base
  ) then
    raise exception 'Chave, unidade e perfil base de um perfil customizado não podem ser alterados';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_perfis_acesso_custom_imutavel on public.perfis_acesso;
create trigger trg_perfis_acesso_custom_imutavel
before update on public.perfis_acesso
for each row execute function public.tg_perfis_acesso_custom_imutavel();

-- 2. Vínculo da pessoa com o perfil customizado ------------------------------
-- Sem ON DELETE: apagar um perfil que alguém usa falha (a tela avisa antes).
alter table public.clinica_memberships
  add column if not exists perfil_acesso_id uuid references public.perfis_acesso(id);

create index if not exists idx_clinica_memberships_perfil_acesso
  on public.clinica_memberships(perfil_acesso_id)
  where perfil_acesso_id is not null;

-- Mantém role e perfil_acesso_id coerentes, seja quem for que grave:
--   * com perfil customizado: confere unidade/base e força role = perfil_base;
--   * tela antiga que só troca o role (sem mexer em perfil_acesso_id): a
--     pessoa sai do customizado, senão o role escolhido seria desfeito aqui.
create or replace function public.tg_membership_perfil_customizado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base public.app_role;
  v_clinica uuid;
  v_sistema boolean;
begin
  if tg_op = 'UPDATE'
     and new.perfil_acesso_id is not distinct from old.perfil_acesso_id
     and new.role is distinct from old.role then
    new.perfil_acesso_id := null;
  end if;

  if new.perfil_acesso_id is not null then
    select pa.perfil_base, pa.clinica_id, pa.sistema
      into v_base, v_clinica, v_sistema
      from public.perfis_acesso pa
     where pa.id = new.perfil_acesso_id;
    if v_clinica is distinct from new.clinica_id or v_sistema is distinct from false or v_base is null then
      raise exception 'Perfil de acesso inválido para esta unidade';
    end if;
    new.role := v_base;
  end if;

  return new;
end;
$$;

revoke all on function public.tg_membership_perfil_customizado() from public, anon, authenticated;

drop trigger if exists trg_membership_perfil_customizado on public.clinica_memberships;
create trigger trg_membership_perfil_customizado
before insert or update of role, perfil_acesso_id on public.clinica_memberships
for each row execute function public.tg_membership_perfil_customizado();

-- 3. Funções que leem a matriz passam a usar o perfil customizado ------------
-- Única diferença para a versão de produção: com perfil_acesso_id preenchido,
-- o perfil é esse id; vazio, continua sendo a chave = role.

create or replace function public.has_module_access(
  _user_id uuid,
  _clinica_id uuid,
  _modulo text,
  _nivel text default 'read'::text
)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  WITH m AS (
    SELECT role::text AS role, perfil_acesso_id
    FROM public.clinica_memberships
    WHERE user_id = _user_id
      AND clinica_id = _clinica_id
      AND ativo = true
    LIMIT 1
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM m) THEN false
    WHEN (SELECT role FROM m) = 'admin' THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.perfis_acesso pa
      JOIN public.perfil_permissoes pp ON pp.perfil_id = pa.id
      WHERE pa.clinica_id = _clinica_id
        AND CASE
              WHEN (SELECT perfil_acesso_id FROM m) IS NOT NULL
                THEN pa.id = (SELECT perfil_acesso_id FROM m)
              ELSE pa.chave = (SELECT role FROM m)
            END
        AND pp.modulo = _modulo
        AND (
          (_nivel = 'read'  AND pp.acesso::text IN ('read', 'write'))
          OR
          (_nivel = 'write' AND pp.acesso::text = 'write')
        )
    )
  END
$function$;

create or replace function public.pode_escrever_modulo(
  _user_id uuid,
  _clinica_id uuid,
  _modulos text[]
)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinica_memberships m
    WHERE m.user_id = _user_id
      AND m.clinica_id = _clinica_id
      AND m.ativo = true
      AND (
        m.role = 'admin'
        OR EXISTS (
          SELECT 1
          FROM public.perfis_acesso p
          JOIN public.perfil_permissoes pp ON pp.perfil_id = p.id
          WHERE p.clinica_id = m.clinica_id
            AND CASE
                  WHEN m.perfil_acesso_id IS NOT NULL THEN p.id = m.perfil_acesso_id
                  ELSE p.chave = m.role::text
                END
            AND pp.modulo = ANY (_modulos)
            AND pp.acesso::text = 'write'
        )
      )
  )
$function$;

create or replace function public.can_manage_medicos(_user_id uuid, _clinica_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  SELECT
    public.can_manage_clinica(_user_id, _clinica_id)
    OR EXISTS (
      SELECT 1
      FROM public.clinica_memberships cm
      JOIN public.perfis_acesso pa
        ON pa.clinica_id = cm.clinica_id
       AND CASE
             WHEN cm.perfil_acesso_id IS NOT NULL THEN pa.id = cm.perfil_acesso_id
             ELSE pa.chave = cm.role::text
           END
      JOIN public.perfil_permissoes pp
        ON pp.perfil_id = pa.id
       AND pp.modulo = 'medicos'
       AND pp.acesso = 'write'
      WHERE cm.user_id = _user_id
        AND cm.clinica_id = _clinica_id
        AND cm.ativo = true
    )
$function$;
