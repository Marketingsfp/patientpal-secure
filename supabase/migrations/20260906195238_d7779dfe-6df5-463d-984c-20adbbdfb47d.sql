create or replace function public.nina_metricas_periodo(
  p_clinica uuid,
  p_inicios timestamptz[],
  p_fins timestamptz[],
  p_fuso text default 'America/Sao_Paulo',
  p_incluir_teste boolean default false
) returns jsonb
language sql
stable
set search_path to 'public'
as $function$
with j as (
  select t.i as inicio, u.f as fim
  from unnest(p_inicios) with ordinality t(i, ord)
  join unnest(p_fins) with ordinality u(f, ord2) on t.ord = u.ord2
),
lim as (select min(inicio) as mi, max(fim) as mf from j),
m as (
  select w.id, w.conversa_id, w.direction, w.enviada_por, w.execucao_id, w.created_at
  from whatsapp_mensagens w, lim
  where w.clinica_id = p_clinica
    and w.created_at >= lim.mi and w.created_at < lim.mf
    and exists (select 1 from j where w.created_at >= j.inicio and w.created_at < j.fim)
    and w.status in ('sent','received','system')
    and (p_incluir_teste or coalesce(w.is_teste,false) = false)
    and (p_incluir_teste or not exists (
      select 1 from atend_conversas c where c.id = w.conversa_id and coalesce(c.is_teste,false)))
),
-- Tempo de resposta: espera iniciada por uma mensagem do paciente, medida em
-- tempo corrido real. Nada é descontado por fechamento.
tr as (
  select mi.created_at as em,
         extract(epoch from (r.created_at - mi.created_at)) as segundos
  from m mi
  cross join lateral (
    select w2.created_at
    from whatsapp_mensagens w2
    where w2.conversa_id = mi.conversa_id
      and w2.direction = 'out'
      and w2.created_at > mi.created_at
    order by w2.created_at
    limit 1
  ) r
  where mi.direction = 'in' and mi.conversa_id is not null
),
eventos as (
  select 'mensagem'::text as tipo, id::text as ref, created_at as em from m
  union all
  select 'mensagem_paciente', id::text, created_at from m where direction = 'in'
  union all
  select 'resposta_nina', id::text, created_at from m where direction = 'out' and enviada_por = 'nina'
  union all
  select 'agendamento', a.id::text, a.created_at
  from agendamentos a, lim
  where a.clinica_id = p_clinica
    and a.origem_integracao = any (case when p_incluir_teste
        then array['nina_whatsapp','nina_chat_interno','nina_homologacao']
        else array['nina_whatsapp','nina_chat_interno'] end)
    and (p_incluir_teste or coalesce(a.is_mock_data,false) = false)
    and a.created_at >= lim.mi and a.created_at < lim.mf
    and exists (select 1 from j where a.created_at >= j.inicio and a.created_at < j.fim)
  union all
  select 'encaminhamento', ev.id::text, ev.created_at
  from atend_conversa_eventos ev, lim
  where ev.clinica_id = p_clinica
    and ev.evento = 'HANDOFF_SOLICITADO'
    and coalesce(ev.detalhes ->> 'solicitado_por','IA') = 'IA'
    and ev.created_at >= lim.mi and ev.created_at < lim.mf
    and exists (select 1 from j where ev.created_at >= j.inicio and ev.created_at < j.fim)
    and (p_incluir_teste or not exists (
      select 1 from atend_conversas c where c.id = ev.conversa_id and coalesce(c.is_teste,false)))
  union all
  -- Reporte de usuário: classificado pela mensagem avaliada; ref = mensagem,
  -- para que vários reportes da mesma resposta não virem várias respostas com erro.
  select 'erro_reportado', f.mensagem_id::text, wm.created_at
  from nina_feedback_erros f
  join whatsapp_mensagens wm on wm.id = f.mensagem_id
  cross join lim
  where f.clinica_id = p_clinica
    and coalesce(f.status,'') <> 'rejected'
    and wm.created_at >= lim.mi and wm.created_at < lim.mf
    and exists (select 1 from j where wm.created_at >= j.inicio and wm.created_at < j.fim)
    and (p_incluir_teste or coalesce(wm.is_teste,false) = false)
  union all
  -- Erro confirmado na revisão humana: também pela mensagem avaliada.
  select 'erro_confirmado', f.mensagem_id::text, wm.created_at
  from nina_feedback_erros f
  join whatsapp_mensagens wm on wm.id = f.mensagem_id
  cross join lim
  where f.clinica_id = p_clinica
    and f.status in ('approved','applied','reverted')
    and wm.created_at >= lim.mi and wm.created_at < lim.mf
    and exists (select 1 from j where wm.created_at >= j.inicio and wm.created_at < j.fim)
    and (p_incluir_teste or coalesce(wm.is_teste,false) = false)
  union all
  select 'resposta_avaliada', av.id::text, av.created_at
  from nina_avaliacoes_ia av, lim
  where av.clinica_id = p_clinica
    and av.created_at >= lim.mi and av.created_at < lim.mf
    and exists (select 1 from j where av.created_at >= j.inicio and av.created_at < j.fim)
  union all
  -- Suspeita indicada pela IA: NÃO é erro comprovado.
  select 'suspeita_ia', av.id::text, av.created_at
  from nina_avaliacoes_ia av, lim
  where av.clinica_id = p_clinica
    and (coalesce(av.problema,'') <> '' or coalesce(av.nota, 5) <= 2)
    and av.created_at >= lim.mi and av.created_at < lim.mf
    and exists (select 1 from j where av.created_at >= j.inicio and av.created_at < j.fim)
  union all
  -- Produtividade da revisão humana: pelo próprio momento da correção.
  select 'correcao_aplicada', f.id::text, f.aplicado_em
  from nina_feedback_erros f, lim
  where f.clinica_id = p_clinica
    and f.aplicado_em is not null
    and f.aplicado_em >= lim.mi and f.aplicado_em < lim.mf
    and exists (select 1 from j where f.aplicado_em >= j.inicio and f.aplicado_em < j.fim)
),
-- Unidade histórica não é inferida: eventos sem vínculo confiável usam
-- somente o calendário geral da clínica (unidade nula).
cls as (
  select e.tipo, e.ref, e.em,
         c.d ->> 'classificacao' as classe,
         c.d ->> 'motivo' as motivo,
         c.d ->> 'versao_id' as versao_id,
         c.d ->> 'versao' as versao
  from eventos e
  cross join lateral (
    select public.nina_classificar_atendimento_detalhe(p_clinica, null::uuid, e.em, p_fuso) as d
  ) c
),
trc as (
  select t.segundos, c.d ->> 'classificacao' as classe
  from tr t
  cross join lateral (
    select public.nina_classificar_atendimento_detalhe(p_clinica, null::uuid, t.em, p_fuso) as d
  ) c
),
-- Conversas: primeira mensagem do recorte por conversa (iniciadas) e
-- qualquer interação (com interação). Uma conversa que atravessa o
-- fechamento aparece em mais de um recorte, mas conta uma vez no total.
conv_msgs as (
  select m.conversa_id, m.created_at,
         row_number() over (partition by m.conversa_id order by m.created_at) as ordem
  from m where m.conversa_id is not null
),
conv_cls as (
  select cm.conversa_id, cm.ordem,
         c.d ->> 'classificacao' as classe
  from conv_msgs cm
  cross join lateral (
    select public.nina_classificar_atendimento_detalhe(p_clinica, null::uuid, cm.created_at, p_fuso) as d
  ) c
),
tipos as (
  select tipo, classe, count(*)::int as eventos, count(distinct ref)::int as distintos
  from cls group by 1,2
),
classes(classe) as (values ('DENTRO_DO_HORARIO'),('FORA_DO_HORARIO'),('NAO_CLASSIFICAVEL'))
select jsonb_build_object(
  'fuso', p_fuso,
  'geradoEm', now(),
  'buckets', (
    select jsonb_object_agg(k.classe, (
      select coalesce(jsonb_object_agg(t.tipo, jsonb_build_object('eventos', t.eventos, 'distintos', t.distintos)), '{}'::jsonb)
      from tipos t where t.classe = k.classe
    ))
    from classes k
  ),
  'total', (
    select coalesce(jsonb_object_agg(x.tipo, jsonb_build_object('eventos', x.e, 'distintos', x.d)), '{}'::jsonb)
    from (select tipo, count(*)::int e, count(distinct ref)::int d from cls group by 1) x
  ),
  'tempoResposta', (
    select coalesce(jsonb_object_agg(z.classe, jsonb_build_object(
             'amostras', z.n,
             'medianaSegundos', z.mediana,
             'mediaSegundos', z.media)), '{}'::jsonb)
    from (
      select classe, count(*)::int n,
             round(percentile_cont(0.5) within group (order by segundos)::numeric, 0) as mediana,
             round(avg(segundos)::numeric, 0) as media
      from trc group by 1
    ) z
  ),
  'conversas', jsonb_build_object(
    'unicasTotal', (select count(distinct conversa_id)::int from conv_cls),
    'iniciadas', (
      select coalesce(jsonb_object_agg(classe, n), '{}'::jsonb)
      from (select classe, count(*)::int n from conv_cls where ordem = 1 group by 1) a
    ),
    'comInteracao', (
      select coalesce(jsonb_object_agg(classe, n), '{}'::jsonb)
      from (select classe, count(distinct conversa_id)::int n from conv_cls group by 1) b
    ),
    'observacao', 'Conversas iniciadas e conversas com alguma interação são recortes diferentes e podem se sobrepor: uma conversa que atravessou o fechamento aparece em mais de um recorte, mas conta uma única vez no total de conversas únicas.'
  ),
  'naoClassificavel', jsonb_build_object(
    'eventos', (select count(*)::int from cls where classe = 'NAO_CLASSIFICAVEL'),
    'motivos', coalesce((
      select jsonb_agg(jsonb_build_object('motivo', motivo, 'eventos', n) order by n desc)
      from (select motivo, count(*)::int n from cls where classe = 'NAO_CLASSIFICAVEL' group by 1) mm
    ), '[]'::jsonb)
  ),
  'versoesUtilizadas', coalesce((
    select jsonb_agg(distinct jsonb_build_object('versaoId', versao_id, 'versao', versao))
    from cls where versao_id is not null
  ), '[]'::jsonb),
  'limitacoes', jsonb_build_array(
    'Eventos sem unidade histórica confiável usam apenas o calendário geral da clínica; o recorte por unidade não é completo.',
    'Reporte de usuário, suspeita apontada pela IA e erro confirmado na revisão são contagens distintas e não devem ser somadas.',
    'Vários reportes da mesma resposta contam uma única resposta com erro (coluna "distintos").',
    'Fora do horário cadastrado não significa ausência de atendentes online: presença real depende do histórico de disponibilidade da equipe.',
    'Tempo de resposta é tempo corrido real, sem descontar períodos fechados.'
  )
);
$function$;

revoke all on function public.nina_metricas_periodo(uuid, timestamptz[], timestamptz[], text, boolean) from public, anon;
grant execute on function public.nina_metricas_periodo(uuid, timestamptz[], timestamptz[], text, boolean) to authenticated, service_role;