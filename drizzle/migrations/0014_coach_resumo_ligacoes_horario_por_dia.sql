DROP FUNCTION IF EXISTS public.coach_resumo_ligacoes(uuid, timestamptz, timestamptz, int, int);

CREATE OR REPLACE FUNCTION public.coach_resumo_ligacoes(
  p_clinica uuid, p_inicio timestamptz, p_fim timestamptz,
  p_horarios jsonb DEFAULT '{"1":[8,17],"2":[8,17],"3":[8,17],"4":[8,17],"5":[8,17],"6":[8,13],"7":null}'::jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH rec AS (
  SELECT c.externo_id, c.inicio, c.duracao_seg,
         upper(coalesce(c.situacao,'')) = 'ANSWERED' AS atendida,
         extract(hour FROM c.inicio AT TIME ZONE 'America/Sao_Paulo')::int AS hora,
         extract(isodow FROM c.inicio AT TIME ZONE 'America/Sao_Paulo')::int AS dow,
         (c.inicio AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
         regexp_replace(coalesce(c.origem_numero,''), '\D', '', 'g') AS dig
  FROM tel_chamadas c
  WHERE c.clinica_id = p_clinica
    AND upper(coalesce(c.direcao,'')) = 'INCOMING'
    AND c.inicio >= p_inicio AND c.inicio <= p_fim
),
r AS (
  SELECT *,
    CASE
      WHEN length(dig) IN (12,13) AND left(dig,2) = '55' THEN '+' || dig
      WHEN length(dig) IN (10,11) THEN '+55' || dig
      ELSE NULL END AS e164,
    coalesce(jsonb_typeof(p_horarios -> dow::text) = 'array'
      AND hora >= (p_horarios -> dow::text ->> 0)::int
      AND hora < (p_horarios -> dow::text ->> 1)::int, false) AS dentro
  FROM rec
),
perd AS (SELECT * FROM r WHERE NOT atendida),
ocup AS (
  SELECT count(*) AS n FROM perd p
  WHERE EXISTS (
    SELECT 1 FROM tel_chamadas o
    WHERE o.clinica_id = p_clinica
      AND upper(coalesce(o.situacao,'')) = 'ANSWERED'
      AND o.externo_id <> p.externo_id
      AND o.inicio >= p.inicio - interval '1 day'
      AND p.inicio >= o.inicio
      AND p.inicio < o.inicio + make_interval(secs => coalesce(o.duracao_seg,0))
  )
),
pes AS (
  SELECT e164, count(*) AS tentativas, bool_or(atendida) AS alguma,
         min(inicio) AS primeira, max(inicio) AS ultima
  FROM r WHERE e164 IS NOT NULL GROUP BY e164
),
nunca AS (SELECT * FROM pes WHERE NOT alguma),
horas AS (
  SELECT h.hora, count(r.externo_id) AS recebidas,
         count(r.externo_id) FILTER (WHERE r.atendida) AS atendidas
  FROM generate_series(0,23) AS h(hora) LEFT JOIN r ON r.hora = h.hora
  GROUP BY h.hora
),
dias AS (
  SELECT d.dow, count(r.externo_id) AS recebidas,
         count(r.externo_id) FILTER (WHERE r.atendida) AS atendidas,
         count(DISTINCT r.dia) AS ndias
  FROM generate_series(1,7) AS d(dow) LEFT JOIN r ON r.dow = d.dow
  GROUP BY d.dow
),
faixas AS (
  SELECT f.ord, f.faixa, count(p.externo_id) AS n
  FROM (VALUES (1,'<10s',0,10),(2,'10-19s',10,20),(3,'20-29s',20,30),(4,'30-59s',30,60),(5,'>=60s',60,2147483647)) AS f(ord,faixa,lo,hi)
  LEFT JOIN perd p ON coalesce(p.duracao_seg,0) >= f.lo AND coalesce(p.duracao_seg,0) < f.hi
  GROUP BY f.ord, f.faixa
)
SELECT jsonb_build_object(
  'totais', (SELECT jsonb_build_object('recebidas', count(*), 'atendidas', count(*) FILTER (WHERE atendida),
      'naoAtendidas', count(*) FILTER (WHERE NOT atendida),
      'pctPerdido', CASE WHEN count(*) = 0 THEN 0 ELSE round(100.0 * count(*) FILTER (WHERE NOT atendida) / count(*), 1) END) FROM r),
  'dentroHorario', (SELECT jsonb_build_object('recebidas', count(*), 'atendidas', count(*) FILTER (WHERE atendida),
      'naoAtendidas', count(*) FILTER (WHERE NOT atendida),
      'pctPerdido', CASE WHEN count(*) = 0 THEN 0 ELSE round(100.0 * count(*) FILTER (WHERE NOT atendida) / count(*), 1) END) FROM r WHERE dentro),
  'foraHorario', (SELECT jsonb_build_object('recebidas', count(*), 'atendidas', count(*) FILTER (WHERE atendida),
      'naoAtendidas', count(*) FILTER (WHERE NOT atendida),
      'pctPerdido', CASE WHEN count(*) = 0 THEN 0 ELSE round(100.0 * count(*) FILTER (WHERE NOT atendida) / count(*), 1) END) FROM r WHERE NOT dentro),
  'porHora', (SELECT jsonb_agg(jsonb_build_object('hora', hora, 'recebidas', recebidas, 'atendidas', atendidas,
      'naoAtendidas', recebidas - atendidas,
      'pctPerdido', CASE WHEN recebidas = 0 THEN 0 ELSE round(100.0 * (recebidas - atendidas) / recebidas, 1) END) ORDER BY hora) FROM horas),
  'linhaLivre', (SELECT jsonb_build_object('perdidas', (SELECT count(*) FROM perd), 'comLinhaOcupada', ocup.n,
      'pctOcupada', CASE WHEN (SELECT count(*) FROM perd) = 0 THEN 0 ELSE round(100.0 * ocup.n / (SELECT count(*) FROM perd), 1) END) FROM ocup),
  'tempoTocando', (SELECT jsonb_agg(jsonb_build_object('faixa', faixa, 'n', n) ORDER BY ord) FROM faixas),
  'pessoas', (SELECT jsonb_build_object('distintas', count(*), 'nuncaFalaram', count(*) FILTER (WHERE NOT alguma),
      'pctNunca', CASE WHEN count(*) = 0 THEN 0 ELSE round(100.0 * count(*) FILTER (WHERE NOT alguma) / count(*), 1) END) FROM pes),
  'retorno', coalesce((SELECT jsonb_agg(jsonb_build_object('numero', e164, 'tentativas', tentativas, 'primeira', primeira, 'ultima', ultima) ORDER BY tentativas DESC, ultima DESC)
      FROM (SELECT * FROM nunca ORDER BY tentativas DESC, ultima DESC LIMIT 200) t), '[]'::jsonb),
  'retornoTotal', (SELECT count(*) FROM nunca),
  'porDiaSemana', (SELECT jsonb_agg(jsonb_build_object('dow', dow, 'recebidas', recebidas, 'atendidas', atendidas,
      'naoAtendidas', recebidas - atendidas,
      'pctPerdido', CASE WHEN recebidas = 0 THEN 0 ELSE round(100.0 * (recebidas - atendidas) / recebidas, 1) END,
      'diasNoPeriodo', ndias,
      'mediaPorDia', CASE WHEN ndias = 0 THEN 0 ELSE round(recebidas::numeric / ndias, 1) END) ORDER BY dow) FROM dias),
  'horarios', p_horarios
);
$$;

REVOKE ALL ON FUNCTION public.coach_resumo_ligacoes(uuid, timestamptz, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coach_resumo_ligacoes(uuid, timestamptz, timestamptz, jsonb) TO service_role;