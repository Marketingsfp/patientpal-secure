-- Alçada nominal: poder de autorizar dado a UMA pessoa, pelo ID dela.
--
-- POR QUE ESTA TABELA EXISTE
-- Até aqui, quem podia isentar cobrança ("sem faturamento"), dar desconto ou
-- liberar débito era decidido por CARGO (admin, gestor, supervisor…) somado à
-- marcação de gestão do vínculo. Quando uma pessoa específica precisa de um
-- desses poderes e o cargo dela não dá, as duas saídas antigas eram ruins:
-- promover a pessoa de cargo (o que arrasta acesso a dinheiro, repasse e
-- administração) ou acrescentar o cargo inteiro à lista de quem autoriza (o
-- que faz qualquer colega do mesmo cargo herdar o poder depois, sem ninguém
-- lembrar do efeito colateral).
--
-- Cada linha aqui é uma liberação NOMINAL: vale para aquele user_id, naquela
-- clínica, naquele escopo, e para mais ninguém. Não existe forma de conceder
-- por cargo através desta tabela — é essa a garantia que ela dá.
--
-- Não substitui a regra por cargo: quem já autoriza pelo cargo continua
-- autorizando. Esta tabela só ACRESCENTA pessoas.

create table if not exists public.usuario_alcadas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  user_id uuid not null,
  -- Mesmos nomes de ESCOPOS_AUTORIZACAO em src/lib/autorizacao-supervisor.ts:
  -- sem_faturamento, desconto, liberar_debito, alerta_critico.
  escopo text not null,
  -- Rastro de quem concedeu e por quê. Alçada é poder sobre dinheiro: daqui a
  -- seis meses tem que dar para responder quem liberou e com que justificativa.
  concedido_por uuid,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usuario_alcadas_pessoa_escopo_unico unique (clinica_id, user_id, escopo)
);

create index if not exists idx_usuario_alcadas_pessoa
  on public.usuario_alcadas (clinica_id, user_id);

alter table public.usuario_alcadas enable row level security;

-- LEITURA: a própria pessoa precisa ler a alçada dela (é o que a tela da
-- Agenda consulta para não pedir senha à toa). Quem administra lê todas.
drop policy if exists "Pessoa ve as proprias alcadas" on public.usuario_alcadas;
create policy "Pessoa ve as proprias alcadas"
  on public.usuario_alcadas
  for select
  using (
    (user_id = auth.uid() and public.is_member(auth.uid(), clinica_id))
    or public.can_manage_clinica(auth.uid(), clinica_id)
  );

-- ESCRITA: só quem administra a clínica. Ninguém concede alçada a si mesmo
-- sem já ser administrador.
drop policy if exists "Gestores concedem alcada" on public.usuario_alcadas;
create policy "Gestores concedem alcada"
  on public.usuario_alcadas
  for insert
  with check (public.can_manage_clinica(auth.uid(), clinica_id));

drop policy if exists "Gestores editam alcada" on public.usuario_alcadas;
create policy "Gestores editam alcada"
  on public.usuario_alcadas
  for update
  using (public.can_manage_clinica(auth.uid(), clinica_id))
  with check (public.can_manage_clinica(auth.uid(), clinica_id));

drop policy if exists "Gestores revogam alcada" on public.usuario_alcadas;
create policy "Gestores revogam alcada"
  on public.usuario_alcadas
  for delete
  using (public.can_manage_clinica(auth.uid(), clinica_id));

drop trigger if exists trg_usuario_alcadas_updated on public.usuario_alcadas;
create trigger trg_usuario_alcadas_updated
  before update on public.usuario_alcadas
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_audit_usuario_alcadas on public.usuario_alcadas;
create trigger trg_audit_usuario_alcadas
  after insert or delete or update on public.usuario_alcadas
  for each row execute function public.fn_audit_trigger();

comment on table public.usuario_alcadas is
  'Liberação nominal de poder de autorizar (sem_faturamento, desconto, liberar_debito, alerta_critico). Vale só para o user_id da linha — nunca por cargo.';

-- Consulta usada pelos gatilhos. SECURITY DEFINER porque o gatilho roda no
-- contexto de quem está gravando, e a recepcionista não enxerga a linha de
-- outra pessoa pela RLS.
create or replace function public.tem_alcada_nominal(
  _user_id uuid,
  _clinica_id uuid,
  _escopo text
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.usuario_alcadas ua
     where ua.user_id = _user_id
       and ua.clinica_id = _clinica_id
       and ua.escopo = _escopo
  );
$$;

-- A trava do sem faturamento passa a aceitar TAMBÉM a alçada nominal, além do
-- cargo. Nada do que já valia foi retirado: quem autorizava pelo cargo
-- continua autorizando exatamente como antes.
create or replace function public.fn_sem_faturamento_exige_motivo_e_alcada()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  -- OLD não existe em INSERT: lê-lo no DECLARE derrubaria todo cadastro novo
  -- de agendamento com "record old is not assigned yet".
  v_antes boolean;
  v_depois boolean := COALESCE(NEW.sem_faturamento, false);
  v_uid uuid := auth.uid();
  v_tem_alcada boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_antes := false;
  ELSE
    v_antes := COALESCE(OLD.sem_faturamento, false);
  END IF;

  -- A marcação não mudou: nada a validar.
  IF v_antes IS NOT DISTINCT FROM v_depois THEN
    RETURN NEW;
  END IF;

  -- Reagendamento: a isenção já autorizada só está mudando de ficha junto com
  -- o paciente (ver reagendar_atendimento).
  IF COALESCE(current_setting('app.reagendamento_em_curso', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF v_depois AND COALESCE(LENGTH(BTRIM(NEW.sem_faturamento_motivo)), 0) < 4 THEN
    RAISE EXCEPTION
      'Para marcar um atendimento como SEM FATURAMENTO é obrigatório informar o motivo da isenção.';
  END IF;

  -- Rotina do sistema, sem usuário logado (importação, edge function): segue.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Alçada pelo CARGO (como sempre foi) OU liberação NOMINAL daquela pessoa.
  v_tem_alcada := public.has_any_role(
    _user_id => v_uid,
    _clinica_id => NEW.clinica_id,
    _roles => ARRAY['admin', 'gestor', 'supervisor']::public.app_role[]
  ) OR public.tem_alcada_nominal(v_uid, NEW.clinica_id, 'sem_faturamento');

  -- Quem não tem alçada só passa se um supervisor tiver autorizado na hora —
  -- é o caminho da recepcionista que pediu a senha na tela. Quem autoriza
  -- também pode ser alguém com liberação nominal.
  IF NOT v_tem_alcada THEN
    IF NEW.sem_faturamento_autorizado_por IS NULL
       OR NOT (
         public.has_any_role(
           _user_id => NEW.sem_faturamento_autorizado_por,
           _clinica_id => NEW.clinica_id,
           _roles => ARRAY['admin', 'gestor', 'supervisor']::public.app_role[]
         )
         OR public.tem_alcada_nominal(
              NEW.sem_faturamento_autorizado_por, NEW.clinica_id, 'sem_faturamento'
            )
       )
    THEN
      RAISE EXCEPTION
        'Marcar ou remover SEM FATURAMENTO é uma ação restrita à supervisão (administrador, gestor ou supervisor). Peça a autorização na tela da Agenda.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
