CREATE OR REPLACE FUNCTION public._do_import_pacientes_mj()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _inserted integer;
BEGIN
  SET LOCAL statement_timeout = 0;
  SET LOCAL lock_timeout = 0;

  WITH src AS (
    SELECT
      CASE
        WHEN NULLIF(trim(codigo_prontuario_anterior),'') IS NULL THEN NULL
        WHEN length(trim(codigo_prontuario_anterior)) < 5 THEN LPAD(trim(codigo_prontuario_anterior),5,'0')
        ELSE trim(codigo_prontuario_anterior)
      END AS cod_pad,
      trim(nome) AS nome,
      NULLIF(cpf,'') AS cpf,
      NULLIF(telefone,'') AS telefone,
      NULLIF(telefone2,'') AS telefone2,
      NULLIF(lower(email),'') AS email,
      CASE WHEN data_nascimento ~ '^\d{4}-\d{2}-\d{2}$' THEN data_nascimento::date ELSE NULL END AS data_nascimento,
      COALESCE(NULLIF(sexo,''), 'nao_informar') AS sexo,
      NULLIF(cep,'') AS cep,
      NULLIF(logradouro,'') AS logradouro,
      NULLIF(numero,'') AS numero,
      NULLIF(complemento,'') AS complemento,
      NULLIF(bairro,'') AS bairro,
      NULLIF(cidade,'') AS cidade,
      NULLIF(estado,'') AS estado
    FROM public._tmp_import_pacientes
    WHERE nome IS NOT NULL AND length(trim(nome)) BETWEEN 2 AND 200
  ),
  filtered AS (
    SELECT s.* FROM src s
    WHERE (s.cod_pad IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.pacientes p
        WHERE p.clinica_id='7570ddde-8c1c-4b55-ba72-cf12b2a6c940'::uuid
          AND p.codigo_prontuario_anterior = s.cod_pad))
      AND (s.cpf IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.pacientes p
        WHERE p.clinica_id='7570ddde-8c1c-4b55-ba72-cf12b2a6c940'::uuid
          AND p.cpf_digits = s.cpf))
  ),
  dedup AS (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY cod_pad ORDER BY nome) AS rn_cod,
      ROW_NUMBER() OVER (PARTITION BY cpf ORDER BY nome) AS rn_cpf
    FROM filtered
  ),
  maxc AS (
    SELECT COALESCE(MAX(codigo_prontuario::bigint), 2435050) AS m
    FROM public.pacientes
    WHERE clinica_id='7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
      AND codigo_prontuario ~ '^\d+$'
  ),
  final AS (
    SELECT d.*, (SELECT m FROM maxc) + ROW_NUMBER() OVER (ORDER BY cod_pad NULLS LAST, nome) AS seq
    FROM dedup d
    WHERE (cod_pad IS NULL OR rn_cod = 1)
      AND (cpf IS NULL OR rn_cpf = 1)
  ),
  ins AS (
    INSERT INTO public.pacientes
      (clinica_id, nome, cpf, telefone, telefone2, email, data_nascimento, sexo,
       cep, logradouro, numero, complemento, bairro, cidade, estado,
       codigo_prontuario_anterior, codigo_prontuario, ativo)
    SELECT '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'::uuid,
      nome, cpf, telefone, telefone2, email, data_nascimento, sexo,
      cep, logradouro, numero, complemento, bairro, cidade, estado,
      cod_pad, seq::text, true
    FROM final
    RETURNING 1
  )
  SELECT count(*) INTO _inserted FROM ins;

  RETURN _inserted;
END
$fn$;

REVOKE ALL ON FUNCTION public._do_import_pacientes_mj() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._do_import_pacientes_mj() TO service_role;