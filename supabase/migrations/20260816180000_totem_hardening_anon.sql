-- ============================================================================
-- Blindagem do totem e das funções abertas ao visitante não logado.
--
-- PROBLEMA 1 (crítico) — `totem_match_biometria` deixava QUEM CHAMA escolher o
-- limiar de semelhança do rosto. Mandando um valor alto (ex.: 1e9), a função
-- devolvia o paciente mais próximo mesmo para um descritor de zeros, ou seja:
-- qualquer pessoa na internet, sem login, obtinha `paciente_id` e `nome` de
-- paciente. Com o `paciente_id` em mãos, `totem_checkin_paciente` devolvia nome
-- completo, médico e procedimento (dado de saúde — LGPD art. 11) e ainda movia
-- o agendamento para "recepção".
--
-- Correção: o teto do limiar passa a ser decidido pelo SERVIDOR. O parâmetro
-- continua existindo (os dois chamadores reais mandam 0.55, ver
-- src/lib/face-recognition.ts:60), mas nunca consegue afrouxar o casamento
-- além de 0.6 — que já era o padrão da função. Nada muda para o totem.
--
-- PROBLEMA 2 — funções liberadas ao visitante que nenhum código chama:
--   totem_upsert_paciente ....... cria paciente E biometria facial (escrita)
--   agendar_publico ............. cria paciente E agendamento (escrita)
--   clinicas_publicas ........... lista as clínicas (era o 1º passo do ataque)
--   horarios_disponiveis_publico  expõe a agenda dos médicos
--   especialidades_publicas ..... expõe as especialidades da clínica
--
-- Verificado antes de revogar: nenhuma tem chamador em `src/`, e
-- `agendar_publico` nunca criou um único agendamento em produção. As quatro
-- últimas estavam liberadas para PUBLIC (herdado pelo `anon`), por isso o
-- REVOKE precisa citar PUBLIC — revogar só de `anon` não teria efeito algum.
-- O acesso de `authenticated` e `service_role` é preservado, para o caso de
-- alguma tela interna passar a usá-las.
--
-- O que NÃO muda aqui, de propósito: `totem_match_biometria`,
-- `totem_checkin_cpf` e `totem_checkin_paciente` continuam liberadas ao
-- visitante — o totem em modo quiosque roda sem login e depende delas.
-- Com o limiar travado, o encadeamento do ataque deixa de funcionar, porque
-- o `paciente_id` (UUID) não é adivinhável.
--
-- Reversível: o SQL para voltar atrás está comentado no fim do arquivo.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- PARTE 1 — limiar de biometria fixado no servidor
--
-- `create or replace` mantém as permissões existentes da função, então o
-- totem continua conseguindo chamá-la sem nenhum grant adicional.
-- ---------------------------------------------------------------------------
create or replace function public.totem_match_biometria(
  _clinica_id uuid,
  _descriptor jsonb,
  _threshold double precision default 0.6
)
returns table(paciente_id uuid, nome text, distancia double precision)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  -- Teto decidido pelo servidor. O valor recebido do chamador só pode deixar
  -- o casamento MAIS rigoroso, nunca mais frouxo.
  c_threshold_max constant double precision := 0.6;
  v_threshold double precision;
  v_query float[];
BEGIN
  IF _descriptor IS NULL OR jsonb_typeof(_descriptor) <> 'array'
     OR jsonb_array_length(_descriptor) <> 128 THEN
    RETURN;
  END IF;

  v_threshold := least(coalesce(_threshold, c_threshold_max), c_threshold_max);

  -- Limiar zero ou negativo nunca casa com ninguém: sai sem consultar nada.
  IF v_threshold <= 0 THEN
    RETURN;
  END IF;

  SELECT array_agg((v)::float ORDER BY ord)
    INTO v_query
    FROM jsonb_array_elements_text(_descriptor) WITH ORDINALITY AS t(v, ord);

  RETURN QUERY
  WITH candidatos AS (
    SELECT
      b.paciente_id,
      p.nome,
      (
        SELECT sqrt(sum(power(v_query[i] - (b.descriptor->>(i-1))::float, 2)))
        FROM generate_series(1, 128) i
      ) AS dist
    FROM public.paciente_biometria b
    JOIN public.pacientes p ON p.id = b.paciente_id
    WHERE b.clinica_id = _clinica_id
      AND b.revogado_em IS NULL
      AND jsonb_typeof(b.descriptor) = 'array'
      AND jsonb_array_length(b.descriptor) = 128
  )
  SELECT c.paciente_id, c.nome, c.dist
  FROM candidatos c
  WHERE c.dist <= v_threshold
  ORDER BY c.dist ASC
  LIMIT 1;
END;
$function$;

-- ---------------------------------------------------------------------------
-- PARTE 2 — tirar do visitante não logado o que ele não precisa executar
-- ---------------------------------------------------------------------------

-- Escrita: cria paciente e cadastra biometria facial. Sem chamador no código.
revoke execute on function
  public.totem_upsert_paciente(uuid, text, text, text, jsonb)
  from anon;

-- Escrita: cria paciente e agendamento. Sem chamador no código e sem nenhum
-- agendamento criado por ela em produção.
revoke execute on function
  public.agendar_publico(uuid, uuid, timestamptz, timestamptz, text, text, text,
                         text, uuid, uuid, text, text)
  from public, anon;
grant execute on function
  public.agendar_publico(uuid, uuid, timestamptz, timestamptz, text, text, text,
                         text, uuid, uuid, text, text)
  to authenticated, service_role;

-- Leitura: lista as clínicas. Era o primeiro passo do encadeamento do ataque.
revoke execute on function public.clinicas_publicas() from public, anon;
grant execute on function public.clinicas_publicas() to authenticated, service_role;

-- Leitura: expõe a agenda dos médicos.
revoke execute on function
  public.horarios_disponiveis_publico(uuid, uuid, uuid, date, integer, integer)
  from public, anon;
grant execute on function
  public.horarios_disponiveis_publico(uuid, uuid, uuid, date, integer, integer)
  to authenticated, service_role;

-- Leitura: expõe as especialidades da clínica.
revoke execute on function public.especialidades_publicas(uuid) from public, anon;
grant execute on function public.especialidades_publicas(uuid) to authenticated, service_role;

commit;

-- ============================================================================
-- CONFERÊNCIA (rode depois; deve devolver 0 linhas)
--
--   select p.proname
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('totem_upsert_paciente','agendar_publico',
--                        'clinicas_publicas','horarios_disponiveis_publico',
--                        'especialidades_publicas')
--      and has_function_privilege('anon', p.oid, 'EXECUTE');
--
-- E este deve devolver 0 (o limiar não obedece mais ao chamador):
--
--   set local role anon;
--   select count(*)
--     from public.totem_match_biometria(
--            '<id-da-clinica>'::uuid,
--            (select jsonb_agg(0.0) from generate_series(1,128)),
--            1e9);
-- ============================================================================

-- ============================================================================
-- PARA VOLTAR ATRÁS (descomente tudo abaixo e rode)
--
-- begin;
--
-- create or replace function public.totem_match_biometria(
--   _clinica_id uuid, _descriptor jsonb, _threshold double precision default 0.6
-- )
-- returns table(paciente_id uuid, nome text, distancia double precision)
-- language plpgsql stable security definer set search_path to 'public'
-- as $restore$
-- DECLARE
--   v_query float[];
-- BEGIN
--   IF _descriptor IS NULL OR jsonb_typeof(_descriptor) <> 'array'
--      OR jsonb_array_length(_descriptor) <> 128 THEN
--     RETURN;
--   END IF;
--   SELECT array_agg((v)::float ORDER BY ord) INTO v_query
--     FROM jsonb_array_elements_text(_descriptor) WITH ORDINALITY AS t(v, ord);
--   RETURN QUERY
--   WITH candidatos AS (
--     SELECT b.paciente_id, p.nome,
--       (SELECT sqrt(sum(power(v_query[i] - (b.descriptor->>(i-1))::float, 2)))
--          FROM generate_series(1, 128) i) AS dist
--     FROM public.paciente_biometria b
--     JOIN public.pacientes p ON p.id = b.paciente_id
--     WHERE b.clinica_id = _clinica_id AND b.revogado_em IS NULL
--       AND jsonb_typeof(b.descriptor) = 'array'
--       AND jsonb_array_length(b.descriptor) = 128
--   )
--   SELECT c.paciente_id, c.nome, c.dist FROM candidatos c
--   WHERE c.dist <= _threshold ORDER BY c.dist ASC LIMIT 1;
-- END;
-- $restore$;
--
-- grant execute on function
--   public.totem_upsert_paciente(uuid, text, text, text, jsonb) to anon;
-- grant execute on function
--   public.agendar_publico(uuid, uuid, timestamptz, timestamptz, text, text,
--                          text, text, uuid, uuid, text, text) to anon;
-- grant execute on function public.clinicas_publicas() to anon;
-- grant execute on function
--   public.horarios_disponiveis_publico(uuid, uuid, uuid, date, integer, integer)
--   to anon;
-- grant execute on function public.especialidades_publicas(uuid) to anon;
--
-- commit;
-- ============================================================================
