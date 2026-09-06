-- Homologacao Fase 10 — analista de metricas da Nina.
-- Roda em transacao descartada (termina com RAISE EXCEPTION): nenhum dado
-- ficticio permanece no banco. O resultado sai na mensagem do erro.
do $$
declare
  c uuid := gen_random_uuid();
  uA uuid := gen_random_uuid();
  uB uuid := gen_random_uuid();
  conv uuid := gen_random_uuid();
  ex uuid := gen_random_uuid();
  usr uuid;
  ag_ini timestamptz := timestamptz '2026-08-01 00:00:00-03';
  jul_ini timestamptz := timestamptz '2026-07-01 00:00:00-03';
  m uuid;
  r_mes jsonb; r_manha jsonb; r_resto jsonb; r_sab jsonb; r_jul jsonb;
  r_sab_manha jsonb; r_uteis_manha jsonb;
  cal jsonb;
begin
  select id into usr from auth.users limit 1;
  insert into clinicas(id, nome) values (c, 'ZZ Homologacao Fase10');
  insert into unidades(id, clinica_id, nome) values (uA, c, 'Unidade A'), (uB, c, 'Unidade B');
  insert into atend_conversas(id, clinica_id) values (conv, c);
  insert into nina_execucoes(id, clinica_id, perfil, model, thinking_level, route_reason,
                             latency_ms, tool_calls, success, handoff, retries, created_at, mensagens_entrada)
  values (ex, c, 'teste', 'teste', 'low', 'simple_faq', 10, '{}', true, false, 0, ag_ini, '{}');

  -- Agosto, manha de segunda 03/08 08:00 -> 60 mensagens
  insert into whatsapp_mensagens(clinica_id, conversa_id, direction, status, enviada_por, body, created_at, recebida_em, execucao_id)
  select c, conv, case when g % 2 = 0 then 'in' else 'out' end,
         case when g % 2 = 0 then 'received' else 'sent' end,
         case when g % 2 = 0 then null else 'nina' end,
         'msg', timestamptz '2026-08-03 08:00:00-03', now(), ex
  from generate_series(1, 60) g;

  -- Agosto, manha de sabado 08/08 09:00 -> 20 mensagens
  insert into whatsapp_mensagens(clinica_id, conversa_id, direction, status, enviada_por, body, created_at, recebida_em, execucao_id)
  select c, conv, case when g % 2 = 0 then 'in' else 'out' end,
         case when g % 2 = 0 then 'received' else 'sent' end,
         case when g % 2 = 0 then null else 'nina' end,
         'msg', timestamptz '2026-08-08 09:00:00-03', now(), ex
  from generate_series(1, 20) g;

  -- Agosto, fora da manha: segunda 03/08 14:00 -> 120 mensagens
  insert into whatsapp_mensagens(clinica_id, conversa_id, direction, status, enviada_por, body, created_at, recebida_em, execucao_id)
  select c, conv, case when g % 2 = 0 then 'in' else 'out' end,
         case when g % 2 = 0 then 'received' else 'sent' end,
         case when g % 2 = 0 then null else 'nina' end,
         'msg', timestamptz '2026-08-03 14:00:00-03', now(), ex
  from generate_series(1, 120) g;

  -- Julho: 600 mensagens (mais erros em quantidade, taxa menor)
  insert into whatsapp_mensagens(clinica_id, conversa_id, direction, status, enviada_por, body, created_at, recebida_em, execucao_id)
  select c, conv, case when g % 2 = 0 then 'in' else 'out' end,
         case when g % 2 = 0 then 'received' else 'sent' end,
         case when g % 2 = 0 then null else 'nina' end,
         'msg', timestamptz '2026-07-06 10:00:00-03', now(), ex
  from generate_series(1, 600) g;

  -- Erros: 1 na manha de segunda, 1 na manha de sabado, 1 fora da manha, 4 em julho
  for m in
    select id from whatsapp_mensagens
    where clinica_id = c and enviada_por = 'nina' and created_at = timestamptz '2026-08-03 08:00:00-03' limit 1
  loop
    insert into nina_feedback_erros(clinica_id, conversa_id, mensagem_id, categoria, status, reportado_por, created_at, origem)
    values (c, conv, m, 'nao_classificado', 'pending', usr, now(), 'nina_message_quick_report');
  end loop;
  for m in
    select id from whatsapp_mensagens
    where clinica_id = c and enviada_por = 'nina' and created_at = timestamptz '2026-08-08 09:00:00-03' limit 1
  loop
    insert into nina_feedback_erros(clinica_id, conversa_id, mensagem_id, categoria, status, reportado_por, created_at, origem)
    values (c, conv, m, 'nao_classificado', 'pending', usr, now(), 'nina_message_quick_report');
  end loop;
  for m in
    select id from whatsapp_mensagens
    where clinica_id = c and enviada_por = 'nina' and created_at = timestamptz '2026-08-03 14:00:00-03' limit 1
  loop
    insert into nina_feedback_erros(clinica_id, conversa_id, mensagem_id, categoria, status, reportado_por, created_at, origem)
    values (c, conv, m, 'nao_classificado', 'pending', usr, now(), 'nina_message_quick_report');
  end loop;
  insert into nina_feedback_erros(clinica_id, conversa_id, mensagem_id, categoria, status, reportado_por, created_at, origem)
  select c, conv, id, 'nao_classificado', 'pending', usr, now(), 'nina_message_quick_report'
  from whatsapp_mensagens
  where clinica_id = c and enviada_por = 'nina' and created_at = timestamptz '2026-07-06 10:00:00-03'
  limit 4;

  -- ------------------------------------------------------------------
  -- Calendario analitico
  -- ------------------------------------------------------------------
  -- Segunda com intervalo de almoco (08-12 e 13-18), vigente em agosto
  insert into nina_calendario_atendimento(clinica_id, dia_semana, hora_inicio, hora_fim, vigencia_inicio, vigencia_fim)
  values (c, 1, '08:00', '12:00', date '2026-08-01', date '2026-08-31'),
         (c, 1, '13:00', '18:00', date '2026-08-01', date '2026-08-31'),
  -- Sabado com expediente reduzido
         (c, 6, '08:00', '12:00', date '2026-08-01', null),
  -- Mudanca de horario a partir de setembro
         (c, 1, '09:00', '13:00', date '2026-09-01', null);
  -- Unidades com horarios diferentes na mesma segunda
  insert into nina_calendario_atendimento(clinica_id, unidade_id, dia_semana, hora_inicio, hora_fim, vigencia_inicio)
  values (c, uA, 1, '08:00', '12:00', date '2026-08-01'),
         (c, uB, 1, '14:00', '18:00', date '2026-08-01');
  -- Feriado com excecao cadastrada
  insert into nina_calendario_excecoes(clinica_id, data, tipo, descricao)
  values (c, date '2026-09-07', 'fechado', 'Independencia');

  cal := jsonb_build_object(
    'sabado_reduzido_09h', public.nina_classificar_atendimento(c, null, timestamptz '2026-08-08 09:00:00-03'),
    'sabado_reduzido_13h', public.nina_classificar_atendimento(c, null, timestamptz '2026-08-08 13:00:00-03'),
    'domingo_10h', public.nina_classificar_atendimento(c, null, timestamptz '2026-08-09 10:00:00-03'),
    'feriado_10h', public.nina_classificar_atendimento(c, null, timestamptz '2026-09-07 10:00:00-03'),
    'almoco_12h30', public.nina_classificar_atendimento(c, null, timestamptz '2026-08-03 12:30:00-03'),
    'tarde_14h', public.nina_classificar_atendimento(c, null, timestamptz '2026-08-03 14:00:00-03'),
    'unidadeA_09h', public.nina_classificar_atendimento(c, uA, timestamptz '2026-08-03 09:00:00-03'),
    'unidadeB_09h', public.nina_classificar_atendimento(c, uB, timestamptz '2026-08-03 09:00:00-03'),
    'unidadeB_15h', public.nina_classificar_atendimento(c, uB, timestamptz '2026-08-03 15:00:00-03'),
    'agosto_08h30', public.nina_classificar_atendimento(c, null, timestamptz '2026-08-03 08:30:00-03'),
    'setembro_08h30', public.nina_classificar_atendimento(c, null, timestamptz '2026-09-07 08:30:00-03'),
    'setembro_10h_segunda', public.nina_classificar_atendimento(c, null, timestamptz '2026-09-14 10:00:00-03'),
    'sem_calendario_janeiro', public.nina_classificar_atendimento(c, null, timestamptz '2026-01-05 10:00:00-03'),
    'limite_abertura_08h00', public.nina_classificar_atendimento(c, null, timestamptz '2026-08-03 08:00:00-03'),
    'limite_fechamento_12h00', public.nina_classificar_atendimento(c, null, timestamptz '2026-08-03 12:00:00-03'),
    'virada_dia_23h30_domingo', public.nina_classificar_atendimento(c, null, timestamptz '2026-08-03 02:30:00+00'),
    'virada_dia_23h30_segunda', public.nina_classificar_atendimento(c, null, timestamptz '2026-08-04 02:30:00+00'));

  -- Presenca de atendente NAO pode mudar a classificacao do calendario
  insert into atend_agente_presenca(clinica_id, user_id, status)
  values (c, usr, 'ONLINE');
  cal := cal || jsonb_build_object(
    'com_atendente_online_domingo_10h', public.nina_classificar_atendimento(c, null, timestamptz '2026-08-09 10:00:00-03'),
    'com_atendente_online_segunda_09h', public.nina_classificar_atendimento(c, null, timestamptz '2026-08-03 09:00:00-03'));

  -- ------------------------------------------------------------------
  -- Consultas analiticas
  -- ------------------------------------------------------------------
  r_mes := public.nina_metricas_analise(
    c, array[ag_ini]::timestamptz[], array[ag_ini + interval '31 days']::timestamptz[]);
  r_manha := public.nina_metricas_analise(
    c, array[timestamptz '2026-08-03 07:00:00-03', timestamptz '2026-08-08 07:00:00-03']::timestamptz[],
       array[timestamptz '2026-08-03 12:00:00-03', timestamptz '2026-08-08 12:00:00-03']::timestamptz[]);
  r_resto := public.nina_metricas_analise(
    c, array[timestamptz '2026-08-03 12:00:00-03']::timestamptz[],
       array[timestamptz '2026-08-04 00:00:00-03']::timestamptz[]);
  r_sab := public.nina_metricas_analise(
    c, array[ag_ini]::timestamptz[], array[ag_ini + interval '31 days']::timestamptz[],
    'America/Sao_Paulo', 'dia', false, array[6]);
  r_sab_manha := public.nina_metricas_analise(
    c, array[timestamptz '2026-08-03 07:00:00-03', timestamptz '2026-08-08 07:00:00-03']::timestamptz[],
       array[timestamptz '2026-08-03 12:00:00-03', timestamptz '2026-08-08 12:00:00-03']::timestamptz[],
    'America/Sao_Paulo', 'dia', false, array[6]);
  r_uteis_manha := public.nina_metricas_analise(
    c, array[timestamptz '2026-08-03 07:00:00-03', timestamptz '2026-08-08 07:00:00-03']::timestamptz[],
       array[timestamptz '2026-08-03 12:00:00-03', timestamptz '2026-08-08 12:00:00-03']::timestamptz[],
    'America/Sao_Paulo', 'dia', false, array[1,2,3,4,5]);
  r_jul := public.nina_metricas_analise(
    c, array[jul_ini]::timestamptz[], array[jul_ini + interval '31 days']::timestamptz[]);

  raise exception 'RESULTADO_FASE10 %', jsonb_build_object(
    'calendario', cal,
    'mes_agosto', jsonb_build_object('msgs', r_mes #> '{indicadores,mensagensTotais}', 'erros', r_mes #> '{indicadores,errosReportados}', 'taxa', r_mes #> '{taxaErro,valor}'),
    'manha', jsonb_build_object('msgs', r_manha #> '{indicadores,mensagensTotais}', 'erros', r_manha #> '{indicadores,errosReportados}', 'taxa', r_manha #> '{taxaErro,valor}'),
    'fora_da_manha', jsonb_build_object('msgs', r_resto #> '{indicadores,mensagensTotais}', 'erros', r_resto #> '{indicadores,errosReportados}', 'taxa', r_resto #> '{taxaErro,valor}'),
    'sabados', jsonb_build_object('msgs', r_sab #> '{indicadores,mensagensTotais}', 'erros', r_sab #> '{indicadores,errosReportados}', 'taxa', r_sab #> '{taxaErro,valor}'),
    'sabado_manha', jsonb_build_object('msgs', r_sab_manha #> '{indicadores,mensagensTotais}', 'erros', r_sab_manha #> '{indicadores,errosReportados}', 'taxa', r_sab_manha #> '{taxaErro,valor}'),
    'uteis_manha', jsonb_build_object('msgs', r_uteis_manha #> '{indicadores,mensagensTotais}', 'erros', r_uteis_manha #> '{indicadores,errosReportados}', 'taxa', r_uteis_manha #> '{taxaErro,valor}'),
    'julho', jsonb_build_object('msgs', r_jul #> '{indicadores,mensagensTotais}', 'erros', r_jul #> '{indicadores,errosReportados}', 'taxa', r_jul #> '{taxaErro,valor}'));
end $$;
