-- Homologacao Fase 5 das metricas da Nina.
-- Roda em transacao descartada: o bloco termina com RAISE EXCEPTION, entao
-- nenhum dado ficticio permanece no banco. O resultado vem na mensagem do erro.
do $$
declare
  c uuid := gen_random_uuid();
  conv uuid := gen_random_uuid();
  convh uuid := gen_random_uuid();
  ex uuid := gen_random_uuid();
  usr uuid;
  d1 timestamptz := timestamptz '2026-09-01 00:00:00-03';
  d2 timestamptz := timestamptz '2026-09-02 00:00:00-03';
  m1 uuid; m2 uuid; m3 uuid; m4 uuid;
  dup text := 'nao testado';
  r_prod jsonb; r_teste jsonb; r_dia jsonb; r_filtro jsonb;
begin
  select id into usr from auth.users limit 1;

  insert into clinicas(id, nome) values (c, 'ZZ Homologacao Fase5');
  insert into atend_conversas(id, clinica_id) values (conv, c), (convh, c);
  insert into nina_execucoes(id, clinica_id, perfil, model, thinking_level, route_reason,
                             latency_ms, tool_calls, success, handoff, retries, created_at, mensagens_entrada)
  values (ex, c, 'teste', 'teste', 'low', 'simple_faq', 10, '{}', true, false, 0, d1 + interval '8 hours', '{}');

  -- 119 recebidas de paciente (80 com execucao vinculada) + 1 exatamente as 07:00
  insert into whatsapp_mensagens(clinica_id, conversa_id, direction, status, body, created_at, recebida_em, execucao_id)
  select c, conv, 'in', 'received', 'texto repetido',
         case when g % 2 = 0 then d1 + interval '8 hours' else d2 + interval '9 hours' end,
         now(),
         case when g <= 80 then ex else null end
  from generate_series(1, 119) g;
  insert into whatsapp_mensagens(clinica_id, conversa_id, direction, status, body, created_at, recebida_em)
  values (c, conv, 'in', 'received', 'limite 07:00', d1 + interval '7 hours', now());

  -- 60 respostas da Nina
  insert into whatsapp_mensagens(clinica_id, conversa_id, direction, status, enviada_por, body, created_at, recebida_em, execucao_id)
  select c, conv, 'out', 'sent', 'nina', 'resposta', d1 + interval '10 hours', now(), ex
  from generate_series(1, 60) g;

  -- 20 mensagens de atendentes (conversa exclusivamente humana)
  insert into whatsapp_mensagens(clinica_id, conversa_id, direction, status, enviada_por, body, created_at, recebida_em)
  select c, convh, 'out', 'sent', 'humano', 'atendente', d2 + interval '11 hours', now()
  from generate_series(1, 20) g;

  -- Nao devem contar
  insert into whatsapp_mensagens(clinica_id, conversa_id, direction, status, enviada_por, body, created_at, recebida_em)
  values (c, conv, 'in', 'received', null, 'limite 12:00', d1 + interval '12 hours', now()),
         (c, conv, 'out', 'failed', 'nina', 'envio falhou', d1 + interval '9 hours', now()),
         (c, conv, 'out', 'draft', 'nina', 'rascunho', d1 + interval '9 hours', now()),
         (c, conv, 'out', 'internal', 'humano', 'nota interna', d1 + interval '9 hours', now()),
         (c, conv, 'in', 'received', null, 'fora do periodo', d1 + interval '3 days', now());
  insert into whatsapp_mensagens(clinica_id, conversa_id, direction, status, enviada_por, body, created_at, recebida_em, is_teste)
  values (c, conv, 'out', 'sent', 'nina', 'mensagem de teste', d1 + interval '10 hours', now(), true);

  select id into m1 from whatsapp_mensagens where clinica_id = c and enviada_por = 'nina' and status = 'sent' and is_teste = false limit 1;
  select id into m2 from whatsapp_mensagens where clinica_id = c and enviada_por = 'nina' and status = 'sent' and is_teste = false and id <> m1 limit 1;
  select id into m3 from whatsapp_mensagens where clinica_id = c and enviada_por = 'nina' and status = 'sent' and is_teste = false and id not in (m1, m2) limit 1;
  select id into m4 from whatsapp_mensagens where clinica_id = c and enviada_por = 'nina' and status = 'sent' and is_teste = false and id not in (m1, m2, m3) limit 1;

  insert into nina_feedback_erros(clinica_id, conversa_id, mensagem_id, categoria, status, reportado_por, created_at, origem)
  values (c, conv, m1, 'nao_classificado', 'pending', usr, d1 + interval '10 hours', 'nina_message_quick_report'),
         (c, conv, m2, 'nao_classificado', 'approved', usr, d1 + interval '11 hours', 'nina_message_quick_report'),
         -- reporte feito dias depois: deve cair no periodo da mensagem original
         (c, conv, m3, 'nao_classificado', 'applied', usr, d1 + interval '5 days', 'nina_message_quick_report'),
         -- rejeitado: fora da taxa
         (c, conv, m4, 'nao_classificado', 'rejected', usr, d1 + interval '10 hours', 'nina_message_quick_report');

  -- duplicidade tecnica do mesmo reporte
  begin
    insert into nina_feedback_erros(clinica_id, conversa_id, mensagem_id, categoria, status, reportado_por, created_at, origem)
    values (c, conv, m1, 'nao_classificado', 'pending', usr, d1 + interval '10 hours', 'nina_message_quick_report');
    dup := 'ACEITOU DUPLICATA';
  exception when unique_violation then
    dup := 'bloqueada pelo indice unico';
  end;

  -- 5 agendamentos concluidos pela Nina + exclusoes
  insert into agendamentos(clinica_id, paciente_nome, inicio, fim, origem_integracao, created_at)
  select c, 'Paciente Teste', d1 + interval '40 days', d1 + interval '40 days 30 minutes', 'nina_whatsapp', d1 + interval '9 hours'
  from generate_series(1, 5) g;
  insert into agendamentos(clinica_id, paciente_nome, inicio, fim, origem_integracao, created_at, is_mock_data)
  values (c, 'Humano', d1 + interval '40 days', d1 + interval '40 days 30 minutes', null, d1 + interval '9 hours', false),
         (c, 'Mock', d1 + interval '40 days', d1 + interval '40 days 30 minutes', 'nina_whatsapp', d1 + interval '9 hours', true),
         (c, 'Fora', d1 + interval '40 days', d1 + interval '40 days 30 minutes', 'nina_whatsapp', d1 + interval '3 days', false);

  -- 7 encaminhamentos iniciados pela Nina + eventos que nao contam
  insert into atend_conversa_eventos(clinica_id, conversa_id, evento, detalhes, created_at)
  select c, conv, 'HANDOFF_SOLICITADO', jsonb_build_object('solicitado_por', 'IA'), d1 + interval '10 hours'
  from generate_series(1, 7) g;
  insert into atend_conversa_eventos(clinica_id, conversa_id, evento, detalhes, created_at)
  values (c, conv, 'HANDOFF_SOLICITADO', jsonb_build_object('solicitado_por', 'humano'), d1 + interval '10 hours'),
         (c, conv, 'ATRIBUIDA', '{}'::jsonb, d1 + interval '10 hours'),
         (c, conv, 'TRANSFERIDA', '{}'::jsonb, d1 + interval '11 hours');

  r_prod := public.nina_metricas_operacionais(
    c, array[d1 + interval '7 hours', d2 + interval '7 hours']::timestamptz[],
       array[d1 + interval '12 hours', d2 + interval '12 hours']::timestamptz[]);
  r_teste := public.nina_metricas_operacionais(
    c, array[d1 + interval '7 hours', d2 + interval '7 hours']::timestamptz[],
       array[d1 + interval '12 hours', d2 + interval '12 hours']::timestamptz[],
    'America/Sao_Paulo', 'dia', true);
  r_dia := public.nina_metricas_operacionais(
    c, array[d1, d2]::timestamptz[], array[d1 + interval '1 day', d2 + interval '1 day']::timestamptz[]);
  r_filtro := public.nina_metricas_operacionais(
    c, array[d1 + interval '7 hours', d2 + interval '7 hours']::timestamptz[],
       array[d1 + interval '12 hours', d2 + interval '12 hours']::timestamptz[],
    'America/Sao_Paulo', 'dia', false, 'approved');

  raise exception 'RESULTADO_FASE5 %', jsonb_build_object(
    'producao', r_prod, 'com_teste', r_teste, 'dia_inteiro', r_dia,
    'filtro_approved', r_filtro, 'duplicidade', dup);
end $$;
