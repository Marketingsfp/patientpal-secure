
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS prontuarios_anteriores text;

CREATE OR REPLACE FUNCTION public._do_fix_phones_prontuarios_mj()
RETURNS TABLE(atualizados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _clin uuid := '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'::uuid;
  _n integer;
BEGIN
  SET LOCAL statement_timeout = 0;
  SET LOCAL lock_timeout = 0;

  -- Agrega dados do staging por (nome normalizado, data_nascimento)
  CREATE TEMP TABLE _agg ON COMMIT DROP AS
  WITH base AS (
    SELECT
      upper(public.strip_accents(trim(nome))) AS nkey,
      data_nascimento,
      NULLIF(regexp_replace(COALESCE(telefone,''), '[^0-9]', '', 'g'), '') AS tel1,
      NULLIF(regexp_replace(COALESCE(telefone2,''), '[^0-9]', '', 'g'), '') AS tel2,
      NULLIF(trim(codigo_prontuario_anterior), '') AS prontuario
    FROM public._tmp_import_pacientes
    WHERE data_nascimento IS NOT NULL
  ),
  exploded AS (
    SELECT nkey, data_nascimento, prontuario,
           (prontuario)::bigint AS pront_num,
           tel
    FROM base,
    LATERAL (VALUES (tel1), (tel2)) v(tel)
    WHERE prontuario ~ '^[0-9]+$'
  ),
  phones AS (
    SELECT nkey, data_nascimento, tel,
           MAX(pront_num) AS last_pront
    FROM exploded
    WHERE tel IS NOT NULL
    GROUP BY nkey, data_nascimento, tel
  ),
  ranked_phones AS (
    SELECT nkey, data_nascimento, tel,
           ROW_NUMBER() OVER (PARTITION BY nkey, data_nascimento ORDER BY last_pront DESC) AS rn
    FROM phones
  ),
  prontuarios AS (
    SELECT nkey, data_nascimento,
           string_agg(prontuario, ', ' ORDER BY (prontuario)::bigint) AS lista,
           COUNT(*) AS qtd
    FROM (SELECT DISTINCT nkey, data_nascimento, prontuario FROM base WHERE prontuario ~ '^[0-9]+$') d
    GROUP BY nkey, data_nascimento
  )
  SELECT
    p.nkey,
    p.data_nascimento,
    p.lista AS prontuarios_lista,
    p.qtd AS prontuarios_qtd,
    MAX(CASE WHEN rp.rn = 1 THEN rp.tel END) AS tel_novo,
    MAX(CASE WHEN rp.rn = 2 THEN rp.tel END) AS tel_alt
  FROM prontuarios p
  LEFT JOIN ranked_phones rp USING (nkey, data_nascimento)
  GROUP BY p.nkey, p.data_nascimento, p.lista, p.qtd;

  CREATE INDEX ON _agg(nkey, data_nascimento);

  UPDATE public.pacientes pac SET
    telefone = COALESCE(a.tel_novo, pac.telefone),
    telefone2 = CASE
      WHEN a.tel_alt IS NOT NULL AND a.tel_alt <> COALESCE(a.tel_novo, '') THEN a.tel_alt
      ELSE pac.telefone2
    END,
    prontuarios_anteriores = CASE WHEN a.prontuarios_qtd > 1 THEN a.prontuarios_lista ELSE pac.prontuarios_anteriores END,
    updated_at = now()
  FROM _agg a
  WHERE pac.clinica_id = _clin
    AND pac.data_nascimento = a.data_nascimento
    AND upper(public.strip_accents(trim(pac.nome))) = a.nkey;

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN QUERY SELECT _n;
END;
$function$;
