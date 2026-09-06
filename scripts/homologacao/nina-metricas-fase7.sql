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
  r_prod jsonb; r_filtro jsonb; r_novo jsonb; r_semcal jsonb; r_ter jsonb; r_qua jsonb; r_dentro jsonb; r_fora jsonb;
begin
  select id into usr from auth.users limit 1;

  insert into clinicas(id, nome) values (c, 'ZZ Homologacao Fase7');
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


  -- (A) Sem calendario configurado: nada pode ser classificado como "fora".
  r_semcal := public.nina_metricas_analise(
    c, array[d1 + interval '7 hours', d2 + interval '7 hours']::timestamptz[],
       array[d1 + interval '12 hours', d2 + interval '12 hours']::timestamptz[]);

  -- Calendario de atendimento humano: tercas, 08:00 as 12:00, desde 01/01/2026.
  insert into nina_calendario_atendimento(clinica_id, dia_semana, hora_inicio, hora_fim, vigencia_inicio)
  values (c, 2, '08:00', '12:00', date '2026-01-01');

  -- (B) Mesmo recorte do painel (Fase 5), sem filtro de calendario.
  r_prod := public.nina_metricas_operacionais(
    c, array[d1 + interval '7 hours', d2 + interval '7 hours']::timestamptz[],
       array[d1 + interval '12 hours', d2 + interval '12 hours']::timestamptz[]);
  r_novo := public.nina_metricas_analise(
    c, array[d1 + interval '7 hours', d2 + interval '7 hours']::timestamptz[],
       array[d1 + interval '12 hours', d2 + interval '12 hours']::timestamptz[]);

  -- (C) Somente tercas / somente quartas.
  r_ter := public.nina_metricas_analise(
    c, array[d1 + interval '7 hours', d2 + interval '7 hours']::timestamptz[],
       array[d1 + interval '12 hours', d2 + interval '12 hours']::timestamptz[],
    'America/Sao_Paulo', 'dia', false, array[2]);
  r_qua := public.nina_metricas_analise(
    c, array[d1 + interval '7 hours', d2 + interval '7 hours']::timestamptz[],
       array[d1 + interval '12 hours', d2 + interval '12 hours']::timestamptz[],
    'America/Sao_Paulo', 'dia', false, array[3]);

  -- (D) Dentro e fora do horario de atendimento humano.
  r_dentro := public.nina_metricas_analise(
    c, array[d1 + interval '7 hours', d2 + interval '7 hours']::timestamptz[],
       array[d1 + interval '12 hours', d2 + interval '12 hours']::timestamptz[],
    'America/Sao_Paulo', 'dia', false, null, 'dentro');
  r_fora := public.nina_metricas_analise(
    c, array[d1 + interval '7 hours', d2 + interval '7 hours']::timestamptz[],
       array[d1 + interval '12 hours', d2 + interval '12 hours']::timestamptz[],
    'America/Sao_Paulo', 'dia', false, null, 'fora');

  -- (E) Filtro de erro nao pode reduzir o denominador.
  r_filtro := public.nina_metricas_analise(
    c, array[d1 + interval '7 hours', d2 + interval '7 hours']::timestamptz[],
       array[d1 + interval '12 hours', d2 + interval '12 hours']::timestamptz[],
    'America/Sao_Paulo', 'dia', false, null, 'todos', 'approved');

  raise exception 'RESULTADO_FASE7 %', jsonb_build_object(
    'painel_fase5', r_prod,
    'analise_mesmo_recorte', r_novo -> 'indicadores' || jsonb_build_object('taxa', r_novo -> 'taxaErro'),
    'sem_calendario', r_semcal -> 'calendario',
    'terca', jsonb_build_object('msgs', r_ter #> '{indicadores,mensagensTotais}', 'erros', r_ter #> '{indicadores,errosReportados}'),
    'quarta', jsonb_build_object('msgs', r_qua #> '{indicadores,mensagensTotais}', 'erros', r_qua #> '{indicadores,errosReportados}'),
    'dentro', jsonb_build_object('msgs', r_dentro #> '{indicadores,mensagensTotais}', 'cal', r_dentro -> 'calendario'),
    'fora', jsonb_build_object('msgs', r_fora #> '{indicadores,mensagensTotais}'),
    'filtro_aprovado', r_filtro -> 'taxaErro',
    'duplicidade', dup);
end $$;
