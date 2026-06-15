
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

  CREATE TEMP TABLE _agg ON COMMIT DROP AS
  WITH base AS (
    SELECT
      upper(public.strip_accents(trim(nome))) AS nkey,
      CASE WHEN data_nascimento ~ '^\d{4}-\d{2}-\d{2}$' THEN data_nascimento::date ELSE NULL END AS dob,
      NULLIF(regexp_replace(COALESCE(telefone,''), '[^0-9]', '', 'g'), '') AS tel1,
      NULLIF(regexp_replace(COALESCE(telefone2,''), '[^0-9]', '', 'g'), '') AS tel2,
      NULLIF(trim(codigo_prontuario_anterior), '') AS prontuario
    FROM public._tmp_import_pacientes
  ),
  filtered AS (
    SELECT * FROM base WHERE dob IS NOT NULL AND prontuario ~ '^[0-9]+$'
  ),
  exploded AS (
    SELECT nkey, dob, prontuario, prontuario::bigint AS pront_num, tel
    FROM filtered, LATERAL (VALUES (tel1), (tel2)) v(tel)
  ),
  phones AS (
    SELECT nkey, dob, tel, MAX(pront_num) AS last_pront
    FROM exploded WHERE tel IS NOT NULL
    GROUP BY nkey, dob, tel
  ),
  ranked_phones AS (
    SELECT nkey, dob, tel,
           ROW_NUMBER() OVER (PARTITION BY nkey, dob ORDER BY last_pront DESC) AS rn
    FROM phones
  ),
  prontuarios AS (
    SELECT nkey, dob,
           string_agg(prontuario, ', ' ORDER BY prontuario::bigint) AS lista,
           COUNT(*) AS qtd
    FROM (SELECT DISTINCT nkey, dob, prontuario FROM filtered) d
    GROUP BY nkey, dob
  )
  SELECT p.nkey, p.dob,
         p.lista AS prontuarios_lista,
         p.qtd AS prontuarios_qtd,
         MAX(CASE WHEN rp.rn = 1 THEN rp.tel END) AS tel_novo,
         MAX(CASE WHEN rp.rn = 2 THEN rp.tel END) AS tel_alt
  FROM prontuarios p
  LEFT JOIN ranked_phones rp USING (nkey, dob)
  GROUP BY p.nkey, p.dob, p.lista, p.qtd;

  CREATE INDEX ON _agg(nkey, dob);

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
    AND pac.data_nascimento = a.dob
    AND upper(public.strip_accents(trim(pac.nome))) = a.nkey;

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN QUERY SELECT _n;
END;
$function$;
