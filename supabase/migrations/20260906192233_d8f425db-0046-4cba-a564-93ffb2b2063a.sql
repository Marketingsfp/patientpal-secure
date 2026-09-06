create or replace function public.nina_classificar_atendimento_detalhe(
  p_clinica uuid,
  p_unidade uuid,
  p_em timestamptz,
  p_fuso text default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql
stable
security invoker
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
  )
  select count(*) into v_n from efetivas;

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
  )
  select * into v_ver from aplicaveis
   where case when exists (select 1 from aplicaveis where unidade_id is not null)
              then unidade_id is not null else true end
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
                     and v_hora >= c.hora_inicio and v_hora < c.hora_fim) then
      v_res := 'DENTRO_DO_HORARIO'; v_motivo := 'dentro_da_faixa';
    else
      v_res := 'FORA_DO_HORARIO'; v_motivo := 'fora_das_faixas';
    end if;
  end if;

  return jsonb_build_object('classificacao', v_res, 'motivo', v_motivo,
                            'versao_id', v_ver.id, 'versao', v_ver.versao,
                            'fuso', coalesce(v_ver.fuso, p_fuso),
                            'data_local', v_dia, 'hora_local', to_char(v_hora, 'HH24:MI'));
end;
$$;

revoke all on function public.nina_classificar_atendimento_detalhe(uuid, uuid, timestamptz, text) from public, anon;
grant execute on function public.nina_classificar_atendimento_detalhe(uuid, uuid, timestamptz, text) to authenticated;