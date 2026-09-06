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

  if not public.can_manage_clinica(v.clinica_id) then
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
    -- Versão anterior que começou antes: encerra no dia anterior ao início da nova.
    update public.nina_calendario_versoes o
       set vigencia_fim = v.vigencia_inicio - 1,
           status = 'substituido'
     where o.status = 'publicado'
       and o.clinica_id = v.clinica_id
       and o.unidade_id is not distinct from v.unidade_id
       and o.id <> v.id
       and o.vigencia_inicio < v.vigencia_inicio
       and coalesce(o.vigencia_fim, 'infinity'::date) >= v.vigencia_inicio;

    -- Versão publicada que começa na mesma data ou depois: fica encerrada de fato
    -- (período vazio), para não valer em paralelo com a nova.
    update public.nina_calendario_versoes o
       set status = 'substituido',
           vigencia_fim = o.vigencia_inicio - 1
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