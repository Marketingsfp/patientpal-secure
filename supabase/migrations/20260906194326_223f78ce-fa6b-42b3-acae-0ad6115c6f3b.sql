create or replace function public.nina_metricas_analise(p_clinica uuid, p_inicios timestamp with time zone[], p_fins timestamp with time zone[], p_fuso text DEFAULT 'America/Sao_Paulo'::text, p_granularidade text DEFAULT 'dia'::text, p_incluir_teste boolean DEFAULT false, p_dias_semana integer[] DEFAULT NULL::integer[], p_calendario text DEFAULT 'todos'::text, p_status text DEFAULT NULL::text, p_categoria text DEFAULT NULL::text, p_root_cause text DEFAULT NULL::text, p_prioridade text DEFAULT NULL::text, p_unidade uuid DEFAULT NULL::uuid, p_assunto text DEFAULT NULL::text)
 returns jsonb
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
gran as (
  select case p_granularidade when 'mes' then 'month' when 'semana' then 'week' else 'day' end as g
),
m0r as (
  -- Mensagem não tem unidade histórica registrada: nunca usar p_unidade (filtro de tela)
  -- como substituta. Só um calendário geral pode ser aplicado.
  select w.id, w.direction, w.enviada_por, w.execucao_id, w.created_at,
         public.nina_classificar_atendimento_detalhe(p_clinica, null::uuid, w.created_at, p_fuso) as det
  from whatsapp_mensagens w, lim
  where w.clinica_id = p_clinica
    and w.created_at >= lim.mi and w.created_at < lim.mf
    and exists (select 1 from j where w.created_at >= j.inicio and w.created_at < j.fim)
    and w.status in ('sent', 'received', 'system')
    and (p_dias_semana is null or extract(dow from (w.created_at at time zone p_fuso))::int = any (p_dias_semana))
    and (p_incluir_teste or coalesce(w.is_teste, false) = false)
    and (
      p_incluir_teste
      or not exists (
        select 1 from atend_conversas c
        where c.id = w.conversa_id and coalesce(c.is_teste, false)
      )
    )
),
m0 as (
  select r.*, case det ->> 'classificacao'
                when 'DENTRO_DO_HORARIO' then 'dentro'
                when 'FORA_DO_HORARIO' then 'fora'
                else 'nao_classificavel' end as cal,
         det ->> 'motivo' as motivo,
         det ->> 'versao_id' as versao_id,
         (det ->> 'versao')::int as versao
  from m0r r
),
m as (select * from m0 where p_calendario = 'todos' or cal = p_calendario),
etr as (
  -- Erro reportado usa o horário da MENSAGEM com erro e a unidade REAL do erro.
  select f.id, f.status, f.validacao_status, wm.created_at as msg_em,
         public.nina_classificar_atendimento_detalhe(p_clinica, f.unidade_id, wm.created_at, p_fuso) as det
  from nina_feedback_erros f
  join whatsapp_mensagens wm on wm.id = f.mensagem_id
  cross join lim
  where f.clinica_id = p_clinica
    and wm.created_at >= lim.mi and wm.created_at < lim.mf
    and exists (select 1 from j where wm.created_at >= j.inicio and wm.created_at < j.fim)
    and (p_dias_semana is null or extract(dow from (wm.created_at at time zone p_fuso))::int = any (p_dias_semana))
    and (p_incluir_teste or coalesce(wm.is_teste, false) = false)
    and (p_status is null or f.status = p_status)
    and (p_categoria is null or f.categoria = p_categoria)
    and (p_root_cause is null or f.root_cause = p_root_cause)
    and (p_prioridade is null or f.prioridade = p_prioridade)
    and (p_unidade is null or f.unidade_id = p_unidade)
    and (p_assunto is null or f.grupo_titulo ilike '%' || p_assunto || '%')
),
et as (
  select r.*, case det ->> 'classificacao'
                when 'DENTRO_DO_HORARIO' then 'dentro'
                when 'FORA_DO_HORARIO' then 'fora'
                else 'nao_classificavel' end as cal,
         det ->> 'motivo' as motivo,
         det ->> 'versao_id' as versao_id,
         (det ->> 'versao')::int as versao
  from etr r
),
ef as (select * from et where p_calendario = 'todos' or cal = p_calendario),
e as (select * from ef where coalesce(status, '') <> 'rejected'),
sem_vinculo as (
  select count(*) as n
  from nina_feedback_erros f, lim
  where f.clinica_id = p_clinica
    and f.mensagem_id is null
    and coalesce(f.status, '') <> 'rejected'
    and f.created_at >= lim.mi and f.created_at < lim.mf
    and exists (select 1 from j where f.created_at >= j.inicio and f.created_at < j.fim)
),
ag0r as (
  select a.id, a.created_at,
         public.nina_classificar_atendimento_detalhe(p_clinica, null::uuid, a.created_at, p_fuso) as det
  from agendamentos a, lim
  where a.clinica_id = p_clinica
    and a.origem_integracao = any (
      case when p_incluir_teste
        then array['nina_whatsapp', 'nina_chat_interno', 'nina_homologacao']
        else array['nina_whatsapp', 'nina_chat_interno'] end
    )
    and (p_incluir_teste or coalesce(a.is_mock_data, false) = false)
    and a.created_at >= lim.mi and a.created_at < lim.mf
    and exists (select 1 from j where a.created_at >= j.inicio and a.created_at < j.fim)
    and (p_dias_semana is null or extract(dow from (a.created_at at time zone p_fuso))::int = any (p_dias_semana))
),
ag0 as (
  select r.*, case det ->> 'classificacao'
                when 'DENTRO_DO_HORARIO' then 'dentro'
                when 'FORA_DO_HORARIO' then 'fora'
                else 'nao_classificavel' end as cal,
         det ->> 'motivo' as motivo,
         det ->> 'versao_id' as versao_id,
         (det ->> 'versao')::int as versao
  from ag0r r
),
ag as (select * from ag0 where p_calendario = 'todos' or cal = p_calendario),
hf0r as (
  select ev.id, ev.created_at,
         public.nina_classificar_atendimento_detalhe(p_clinica, null::uuid, ev.created_at, p_fuso) as det
  from atend_conversa_eventos ev, lim
  where ev.clinica_id = p_clinica
    and ev.evento = 'HANDOFF_SOLICITADO'
    and coalesce(ev.detalhes ->> 'solicitado_por', 'IA') = 'IA'
    and ev.created_at >= lim.mi and ev.created_at < lim.mf
    and exists (select 1 from j where ev.created_at >= j.inicio and ev.created_at < j.fim)
    and (p_dias_semana is null or extract(dow from (ev.created_at at time zone p_fuso))::int = any (p_dias_semana))
    and (
      p_incluir_teste
      or not exists (
        select 1 from atend_conversas c
        where c.id = ev.conversa_id and coalesce(c.is_teste, false)
      )
    )
),
hf0 as (
  select r.*, case det ->> 'classificacao'
                when 'DENTRO_DO_HORARIO' then 'dentro'
                when 'FORA_DO_HORARIO' then 'fora'
                else 'nao_classificavel' end as cal,
         det ->> 'motivo' as motivo,
         det ->> 'versao_id' as versao_id,
         (det ->> 'versao')::int as versao
  from hf0r r
),
hf as (select * from hf0 where p_calendario = 'todos' or cal = p_calendario),
rastro as (
  select 'mensagem'::text as evento, cal, motivo, versao_id, versao from m0
  union all select 'erro', cal, motivo, versao_id, versao from et
  union all select 'agendamento', cal, motivo, versao_id, versao from ag0
  union all select 'encaminhamento', cal, motivo, versao_id, versao from hf0
),
rastro_versoes as (
  select r.versao_id, max(r.versao) as versao, count(*) as eventos,
         v.vigencia_inicio, v.vigencia_fim, v.unidade_id
  from rastro r
  left join nina_calendario_versoes v on v.id = r.versao_id::uuid
  where r.versao_id is not null
  group by r.versao_id, v.vigencia_inicio, v.vigencia_fim, v.unidade_id
),
rastro_motivos as (
  select motivo, count(*) as eventos
  from rastro
  where cal = 'nao_classificavel' and motivo is not null
  group by motivo
),
cobertura as (
  select min(w.created_at) as desde
  from whatsapp_mensagens w
  where w.clinica_id = p_clinica and w.direction = 'in' and w.execucao_id is not null
),
calver as (
  select max(greatest(c.updated_at, c.created_at)) as em, count(*) as regras
  from nina_calendario_atendimento c
  where c.clinica_id = p_clinica and c.ativo
),
serie as (
  select to_char(date_trunc((select g from gran), x.em at time zone p_fuso), 'YYYY-MM-DD') as periodo,
         sum(x.msgs) as mensagens,
         sum(x.erros) as erros
  from (
    select m.created_at as em, 1 as msgs, 0 as erros from m
    union all
    select e.msg_em, 0, 1 from e
  ) x
  group by 1
),
tot as (
  select (select count(*) from m) as msgs, (select count(*) from e) as erros
)
select jsonb_build_object(
  'consultaId', gen_random_uuid(),
  'geradoEm', now(),
  'versaoRegras', 'fase7.1',
  'indicadores', jsonb_build_object(
    'mensagensTotais', (select msgs from tot),
    'msgsPaciente', (select count(*) from m where direction = 'in'),
    'msgsNina', (select count(*) from m where direction = 'out' and enviada_por = 'nina'),
    'msgsHumano', (select count(*) from m where direction = 'out' and enviada_por = 'humano'),
    'msgsAutomaticas', (select count(*) from m where direction = 'out' and coalesce(enviada_por, '') not in ('nina', 'humano')),
    'ninaEntrada', (select count(*) from m where direction = 'in' and execucao_id is not null),
    'ninaSaida', (select count(*) from m where direction = 'out' and enviada_por = 'nina'),
    'ninaParticipacao', (select count(*) from m where (direction = 'in' and execucao_id is not null) or (direction = 'out' and enviada_por = 'nina')),
    'errosReportados', (select erros from tot),
    'errosConfirmados', (select count(*) from e where status in ('approved', 'applied', 'reverted')),
    'errosPendentes', (select count(*) from e where status = 'pending'),
    'errosRejeitados', (select count(*) from ef where status = 'rejected'),
    'correcoesAplicadas', (select count(*) from e where status = 'applied'),
    'correcoesValidadas', (select count(*) from e where validacao_status = 'validado'),
    'correcoesRevertidas', (select count(*) from e where status = 'reverted'),
    'errosSemVinculo', (select n from sem_vinculo),
    'agendamentosNina', (select count(*) from ag),
    'encaminhamentos', (select count(*) from hf)
  ),
  'taxaErro', jsonb_build_object(
    'numerador', (select erros from tot),
    'denominador', (select msgs from tot),
    'valor', case when (select msgs from tot) > 0
                  then round(((select erros from tot)::numeric * 100) / (select msgs from tot), 4)
                  else null end,
    'formula', 'erros reportados da Nina ÷ mensagens totais do sistema × 100',
    'observacao', 'Não representa acurácia da Nina; 100 menos esta taxa não é índice de acerto.'
  ),
  'calendario', jsonb_build_object(
    'modo', p_calendario,
    'regrasVigentes', (select regras from calver),
    'versao', (select em from calver),
    'naoClassificavel', jsonb_build_object(
      'mensagens', (select count(*) from m0 where cal = 'nao_classificavel'),
      'erros', (select count(*) from et where cal = 'nao_classificavel'),
      'agendamentos', (select count(*) from ag0 where cal = 'nao_classificavel'),
      'encaminhamentos', (select count(*) from hf0 where cal = 'nao_classificavel')
    )
  ),
  'rastreabilidade', jsonb_build_object(
    'fuso', p_fuso,
    'referencia', jsonb_build_object(
      'mensagem', 'timestamp da própria mensagem',
      'erro', 'timestamp da mensagem com erro, não o do reporte',
      'agendamento', 'timestamp de criação do registro (evidência disponível)',
      'encaminhamento', 'timestamp do evento real de handoff'
    ),
    'versoesUtilizadas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'versaoId', versao_id, 'versao', versao, 'eventos', eventos,
               'vigenciaInicio', vigencia_inicio, 'vigenciaFim', vigencia_fim,
               'unidadeId', unidade_id) order by versao)
      from rastro_versoes
    ), '[]'::jsonb),
    'motivosNaoClassificavel', coalesce((
      select jsonb_agg(jsonb_build_object('motivo', motivo, 'eventos', eventos) order by eventos desc)
      from rastro_motivos
    ), '[]'::jsonb)
  ),
  'filtros', jsonb_build_object(
    'clinicaId', p_clinica,
    'fuso', p_fuso,
    'janelas', (select count(*) from j),
    'inicio', (select mi from lim),
    'fim', (select mf from lim),
    'granularidade', p_granularidade,
    'diasSemana', to_jsonb(p_dias_semana),
    'ambiente', case when p_incluir_teste then 'todos' else 'producao' end,
    'unidadeId', p_unidade,
    'status', p_status,
    'categoria', p_categoria,
    'rootCause', p_root_cause,
    'prioridade', p_prioridade,
    'assunto', p_assunto
  ),
  'cobertura', jsonb_build_object(
    'entradaMedidaDesde', (select desde from cobertura),
    'limitacoes', jsonb_build_array(
      'Mensagens recebidas e processadas pela Nina só são contadas a partir da data de entradaMedidaDesde.',
      'Unidade só existe nos erros reportados; mensagens, agendamentos e encaminhamentos não têm unidade registrada e por isso usam apenas calendário geral — a unidade escolhida no filtro nunca substitui a unidade histórica.',
      'Sem calendário vigente na data, o trecho é contado como não classificável e nunca como fora do horário.'
    )
  ),
  'serie', coalesce((
    select jsonb_agg(jsonb_build_object('periodo', periodo, 'mensagens', mensagens, 'erros', erros) order by periodo)
    from serie
  ), '[]'::jsonb)
);
$function$;