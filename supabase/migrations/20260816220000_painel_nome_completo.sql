-- ============================================================================
-- Painel de senhas passa a devolver o nome COMPLETO do paciente.
--
-- Até aqui `painel_senhas_publicas` abreviava para "João P." — primeiro nome
-- mais a inicial do sobrenome. A regra oficial de produção definida pela
-- clínica é anunciar o nome por inteiro, então a abreviação sai.
--
-- O que NÃO muda: a função continua devolvendo apenas nome e local. Nada de
-- procedimento, exame ou médico — isso é dado de saúde (LGPD, art. 11) e o
-- painel fica numa TV virada para a sala de espera inteira. A fala do painel
-- é estritamente "{Nome completo}. {Guichê}."
--
-- Efeito colateral esperado: o nome completo passa a aparecer também ESCRITO
-- na tela do painel, porque tela e voz leem o mesmo campo. É o comportamento
-- pretendido, mas vale saber antes de publicar.
--
-- O tipo de retorno não muda (mesmas colunas, mesmos tipos), então
-- CREATE OR REPLACE basta e as permissões atuais são preservadas.
--
-- Reversível: o SQL para voltar à abreviação está no fim do arquivo.
-- ============================================================================

begin;

create or replace function public.painel_senhas_publicas(_clinica_id uuid)
returns table(
  id uuid,
  codigo text,
  tipo text,
  status text,
  guiche text,
  chamada_em timestamp with time zone,
  paciente_id uuid,
  paciente_nome text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  SELECT
    s.id,
    s.codigo,
    s.tipo::text,
    s.status::text,
    s.guiche,
    s.chamada_em,
    s.paciente_id,
    -- Nome completo, sem abreviação (regra oficial da clínica).
    NULLIF(btrim(p.nome), '') AS paciente_nome
  FROM public.senhas s
  LEFT JOIN public.pacientes p ON p.id = s.paciente_id
  WHERE s.clinica_id = _clinica_id
    AND s.data_dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    AND s.status::text IN ('chamada','atendida')
  ORDER BY s.chamada_em DESC NULLS LAST
  LIMIT 6;
$function$;

commit;

-- ============================================================================
-- CONFERÊNCIA (rode depois; troque pelo id da clínica)
--
--   select codigo, guiche, paciente_nome
--     from public.painel_senhas_publicas('7570ddde-8c1c-4b55-ba72-cf12b2a6c940');
--
-- Esperado: paciente_nome com nome e sobrenome por extenso, não "João P.".
-- Se não houver senha chamada hoje, a consulta volta vazia — normal.
-- ============================================================================

-- ============================================================================
-- PARA VOLTAR À ABREVIAÇÃO (descomente e rode)
--
-- begin;
-- create or replace function public.painel_senhas_publicas(_clinica_id uuid)
-- returns table(id uuid, codigo text, tipo text, status text, guiche text,
--               chamada_em timestamp with time zone, paciente_id uuid,
--               paciente_nome text)
-- language sql stable security definer set search_path to 'public'
-- as $restore$
--   SELECT s.id, s.codigo, s.tipo::text, s.status::text, s.guiche, s.chamada_em,
--     s.paciente_id,
--     CASE
--       WHEN p.nome IS NULL OR btrim(p.nome) = '' THEN NULL
--       ELSE split_part(p.nome, ' ', 1) ||
--            CASE WHEN split_part(p.nome, ' ', 2) <> ''
--              THEN ' ' || left(split_part(p.nome, ' ', 2), 1) || '.'
--              ELSE '' END
--     END AS paciente_nome
--   FROM public.senhas s
--   LEFT JOIN public.pacientes p ON p.id = s.paciente_id
--   WHERE s.clinica_id = _clinica_id
--     AND s.data_dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
--     AND s.status::text IN ('chamada','atendida')
--   ORDER BY s.chamada_em DESC NULLS LAST
--   LIMIT 6;
-- $restore$;
-- commit;
-- ============================================================================
