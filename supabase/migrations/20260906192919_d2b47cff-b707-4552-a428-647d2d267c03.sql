-- 1) Publicação: versão anterior que começa na mesma data ou depois vira apenas 'substituido'
create or replace function public.nina_calendario_publicar(
  p_versao_id uuid,
  p_confirmar_conflito boolean default false,
  p_motivo_retroativo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_role text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_conflitos jsonb;
begin
  select * into v from public.nina_calendario_versoes where id = p_versao_id;
  if v is null then raise exception 'Versão do horário não encontrada.'; end if;
  if v.status <> 'rascunho' then raise exception 'Somente rascunhos podem ser publicados.'; end if;

  if not public.can_manage_clinica(auth.uid(), v.clinica_id) then
    raise exception 'Apenas administradores e gestores podem publicar o horário de funcionamento.';
  end if;

  select m.role into v_role
    from public.clinica_memberships m
   where m.user_id = auth.uid() and m.clinica_id = v.clinica_id and m.ativo
   limit 1;

  if not exists (select 1 from public.nina_calendario_atendimento c where c.versao_id = v.id and c.ativo) then
    raise exception 'Configure pelo menos um dia (aberto ou fechado) antes de publicar.';
  end if;

  if v.vigencia_inicio < v_hoje then
    if coalesce(v_role, '') <> 'admin' then
      raise exception 'Publicação com validade em data passada é permitida apenas para administradores.';
    end if;
    if p_motivo_retroativo is null or length(btrim(p_motivo_retroativo)) < 5 then
      raise exception 'Informe a justificativa da publicação retroativa.';
    end if;
  end if;

  select jsonb_agg(jsonb_build_object('id', o.id, 'versao', o.versao,
                                      'vigencia_inicio', o.vigencia_inicio, 'vigencia_fim', o.vigencia_fim))
    into v_conflitos
  from public.nina_calendario_versoes o
  where o.status = 'publicado'
    and o.clinica_id = v.clinica_id
    and o.unidade_id is not distinct from v.unidade_id
    and o.id <> v.id
    and coalesce(o.vigencia_fim, 'infinity'::date) >= v.vigencia_inicio
    and o.vigencia_inicio <= coalesce(v.vigencia_fim, 'infinity'::date);

  if v_conflitos is not null and not coalesce(p_confirmar_conflito, false) then
    return jsonb_build_object('ok', false, 'conflitos', v_conflitos);
  end if;

  if v_conflitos is not null then
    update public.nina_calendario_versoes o
       set vigencia_fim = v.vigencia_inicio - 1,
           status = 'substituido'
     where o.status = 'publicado'
       and o.clinica_id = v.clinica_id
       and o.unidade_id is not distinct from v.unidade_id
       and o.id <> v.id
       and o.vigencia_inicio < v.vigencia_inicio
       and coalesce(o.vigencia_fim, 'infinity'::date) >= v.vigencia_inicio;

    update public.nina_calendario_versoes o
       set status = 'substituido'
     where o.status = 'publicado'
       and o.clinica_id = v.clinica_id
       and o.unidade_id is not distinct from v.unidade_id
       and o.id <> v.id
       and o.vigencia_inicio >= v.vigencia_inicio;
  end if;

  update public.nina_calendario_versoes
     set status = 'publicado',
         publicado_em = now(),
         publicado_por = auth.uid(),
         retroativa = (v.vigencia_inicio < v_hoje),
         motivo_retroativo = case when v.vigencia_inicio < v_hoje then p_motivo_retroativo else null end
   where id = v.id;

  return jsonb_build_object('ok', true, 'versao', v.versao, 'conflitos_encerrados', coalesce(v_conflitos, '[]'::jsonb));
end;
$$;

revoke all on function public.nina_calendario_publicar(uuid, boolean, text) from public, anon;
grant execute on function public.nina_calendario_publicar(uuid, boolean, text) to authenticated;

-- 2) Classificador: publicada prevalece sobre substituída no mesmo escopo
create or replace function public.nina_classificar_atendimento_detalhe(
  p_clinica uuid, p_unidade uuid, p_em timestamptz, p_fuso text default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_ts timestamp;
  v_dia date;
  v_hora time;
  v_dow int;
  v_ver record;
  v_n int;
  v_tem_dia boolean;
  v_res text;
  v_motivo text;
begin
  if p_clinica is null then
    return jsonb_build_object('classificacao','NAO_CLASSIFICAVEL','motivo','escopo_nao_identificavel',
                              'versao_id', null, 'versao', null, 'fuso', p_fuso);
  end if;
  if p_em is null then
    return jsonb_build_object('classificacao','NAO_CLASSIFICAVEL','motivo','timestamp_ausente_ou_invalido',
                              'versao_id', null, 'versao', null, 'fuso', p_fuso);
  end if;

  v_ts := p_em at time zone coalesce(p_fuso, 'America/Sao_Paulo');
  v_dia := v_ts::date;
  v_hora := v_ts::time;
  v_dow := extract(dow from v_ts)::int;

  create temp table if not exists _nina_noop(x int);

  with aplicaveis as (
    select v.*
      from public.nina_calendario_versoes v
     where v.clinica_id = p_clinica
       and v.status in ('publicado','substituido')
       and v.publicado_em is not null
       and v.vigencia_inicio <= v_dia
       and (v.vigencia_fim is null or v.vigencia_fim >= v_dia)
       and (v.unidade_id is null or (p_unidade is not null and v.unidade_id = p_unidade))
  ),
  efetivas as (
    select * from aplicaveis
     where case when exists (select 1 from aplicaveis where unidade_id is not null)
                then unidade_id is not null else true end
  ),
  preferidas as (
    select * from efetivas
     where case when exists (select 1 from efetivas where status = 'publicado')
                then status = 'publicado' else true end
  ),
  finais as (
    select * from preferidas
     where versao = (select max(versao) from preferidas)
  )
  select count(*) into v_n from finais;

  if v_n = 0 then
    return jsonb_build_object('classificacao','NAO_CLASSIFICAVEL','motivo','sem_versao_para_a_data',
                              'versao_id', null, 'versao', null, 'fuso', p_fuso);
  elsif v_n > 1 then
    return jsonb_build_object('classificacao','NAO_CLASSIFICAVEL','motivo','conflito_de_configuracao',
                              'versao_id', null, 'versao', null, 'fuso', p_fuso);
  end if;

  with aplicaveis as (
    select v.*
      from public.nina_calendario_versoes v
     where v.clinica_id = p_clinica
       and v.status in ('publicado','substituido')
       and v.publicado_em is not null
       and v.vigencia_inicio <= v_dia
       and (v.vigencia_fim is null or v.vigencia_fim >= v_dia)
       and (v.unidade_id is null or (p_unidade is not null and v.unidade_id = p_unidade))
  ),
  efetivas as (
    select * from aplicaveis
     where case when exists (select 1 from aplicaveis where unidade_id is not null)
                then unidade_id is not null else true end
  ),
  preferidas as (
    select * from efetivas
     where case when exists (select 1 from efetivas where status = 'publicado')
                then status = 'publicado' else true end
  )
  select * into v_ver from preferidas
   where versao = (select max(versao) from preferidas)
   limit 1;

  if exists (select 1 from public.nina_calendario_excecoes e
              where e.versao_id = v_ver.id and e.data = v_dia and e.tipo = 'fechado') then
    v_res := 'FORA_DO_HORARIO'; v_motivo := 'excecao_fechado';
  elsif exists (select 1 from public.nina_calendario_excecoes e
                 where e.versao_id = v_ver.id and e.data = v_dia and e.tipo = 'especial'
                   and e.hora_inicio is not null and e.hora_fim is not null) then
    if exists (select 1 from public.nina_calendario_excecoes e
                where e.versao_id = v_ver.id and e.data = v_dia and e.tipo = 'especial'
                  and v_hora >= e.hora_inicio and v_hora < e.hora_fim) then
      v_res := 'DENTRO_DO_HORARIO'; v_motivo := 'excecao_especial_dentro';
    else
      v_res := 'FORA_DO_HORARIO'; v_motivo := 'excecao_especial_fora';
    end if;
  else
    select exists (select 1 from public.nina_calendario_atendimento c
                    where c.versao_id = v_ver.id and c.ativo and c.dia_semana = v_dow)
      into v_tem_dia;
    if not v_tem_dia then
      v_res := 'NAO_CLASSIFICAVEL'; v_motivo := 'dia_nao_configurado';
    elsif exists (select 1 from public.nina_calendario_atendimento c
                   where c.versao_id = v_ver.id and c.ativo and c.dia_semana = v_dow and c.fechado) then
      v_res := 'FORA_DO_HORARIO'; v_motivo := 'dia_fechado';
    elsif not exists (select 1 from public.nina_calendario_atendimento c
                       where c.versao_id = v_ver.id and c.ativo and c.dia_semana = v_dow
                         and not c.fechado and c.hora_inicio is not null and c.hora_fim is not null) then
      v_res := 'NAO_CLASSIFICAVEL'; v_motivo := 'dia_nao_configurado';
    elsif exists (select 1 from public.nina_calendario_atendimento c
                   where c.versao_id = v_ver.id and c.ativo and c.dia_semana = v_dow and not c.fechado
                     and c.hora_inicio is not null and c.hora_fim is not null
                     and v_hora >= c.hora_inicio and v_hora < c.hora_fim) then
      v_res := 'DENTRO_DO_HORARIO'; v_motivo := 'dentro_da_faixa';
    else
      v_res := 'FORA_DO_HORARIO'; v_motivo := 'fora_das_faixas';
    end if;
  end if;

  return jsonb_build_object('classificacao', v_res, 'motivo', v_motivo,
                            'versao_id', v_ver.id, 'versao', v_ver.versao,
                            'fuso', coalesce(p_fuso,'America/Sao_Paulo'),
                            'data_local', v_dia, 'hora_local', v_hora);
end;
$$;

revoke all on function public.nina_classificar_atendimento_detalhe(uuid, uuid, timestamptz, text) from public, anon;
grant execute on function public.nina_classificar_atendimento_detalhe(uuid, uuid, timestamptz, text) to authenticated;