
-- ============================================================================
-- P1-BUSCA-UNIFICADA
-- ============================================================================

-- 1) TRIGGER normalização (respeita constraint de tamanho do CPF)
CREATE OR REPLACE FUNCTION public.pacientes_normalize_bi()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cpf  text;
  v_tel  text;
  v_tel2 text;
BEGIN
  IF NEW.cpf IS NOT NULL THEN
    v_cpf := regexp_replace(NEW.cpf, '\D', '', 'g');
    -- Só normaliza se resultado for vazio (vira NULL) ou tiver 11-14 dígitos
    -- (evita quebrar CPFs legados fora do padrão preservando o original)
    IF v_cpf = '' THEN
      NEW.cpf := NULL;
    ELSIF length(v_cpf) BETWEEN 11 AND 14 THEN
      NEW.cpf := v_cpf;
    END IF;
  END IF;

  IF NEW.telefone IS NOT NULL THEN
    v_tel := regexp_replace(NEW.telefone, '\D', '', 'g');
    NEW.telefone := NULLIF(v_tel, '');
  END IF;

  IF NEW.telefone2 IS NOT NULL THEN
    v_tel2 := regexp_replace(NEW.telefone2, '\D', '', 'g');
    NEW.telefone2 := NULLIF(v_tel2, '');
  END IF;

  IF NEW.nome IS NOT NULL THEN
    NEW.nome := btrim(regexp_replace(NEW.nome, '\s+', ' ', 'g'));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pacientes_normalize_bi ON public.pacientes;
CREATE TRIGGER trg_pacientes_normalize_bi
BEFORE INSERT OR UPDATE ON public.pacientes
FOR EACH ROW EXECUTE FUNCTION public.pacientes_normalize_bi();

-- 2) BACKFILL seguro
-- CPF: só quando resultado tem 11-14 dígitos E não gera colisão
UPDATE public.pacientes p
   SET cpf = regexp_replace(p.cpf, '\D', '', 'g')
 WHERE p.cpf IS NOT NULL
   AND p.cpf ~ '\D'
   AND length(regexp_replace(p.cpf, '\D', '', 'g')) BETWEEN 11 AND 14
   AND NOT EXISTS (
     SELECT 1 FROM public.pacientes q
      WHERE q.clinica_id = p.clinica_id
        AND q.id <> p.id
        AND q.cpf = regexp_replace(p.cpf, '\D', '', 'g')
   );

UPDATE public.pacientes
   SET telefone = NULLIF(regexp_replace(telefone, '\D', '', 'g'), '')
 WHERE telefone IS NOT NULL AND telefone ~ '\D'
   AND length(NULLIF(regexp_replace(telefone, '\D', '', 'g'), '')) <= 30;

UPDATE public.pacientes
   SET telefone2 = NULLIF(regexp_replace(telefone2, '\D', '', 'g'), '')
 WHERE telefone2 IS NOT NULL AND telefone2 ~ '\D'
   AND length(NULLIF(regexp_replace(telefone2, '\D', '', 'g'), '')) <= 30;

UPDATE public.pacientes
   SET nome = btrim(regexp_replace(nome, '\s+', ' ', 'g'))
 WHERE nome ~ '  ' OR nome <> btrim(nome);

-- 3) Índice telefone2
CREATE INDEX IF NOT EXISTS idx_pacientes_telefone2_digits
  ON public.pacientes (clinica_id, telefone2)
  WHERE telefone2 IS NOT NULL;

-- 4) RPC buscar_pacientes_global
CREATE OR REPLACE FUNCTION public.buscar_pacientes_global(
  _clinica_ids uuid[],
  _termo text,
  _limite integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  nome text,
  cpf text,
  telefone text,
  data_nascimento date,
  clinica_id uuid,
  codigo_prontuario text,
  codigo_prontuario_anterior text,
  numero_pasta text,
  email text,
  associado_convenio text,
  ultima_consulta date,
  cadastro_incompleto boolean,
  match_score integer,
  match_reason text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_termo    text := trim(coalesce(_termo, ''));
  v_norm     text := upper(public.strip_accents(v_termo));
  v_digits   text := regexp_replace(v_termo, '\D', '', 'g');
  v_limite   int  := least(greatest(coalesce(_limite, 20), 1), 50);
  v_data     date := null;
  v_allowed  uuid[];
  v_is_num   boolean;
  v_tokens   text[];
BEGIN
  IF auth.uid() IS NULL
     OR _clinica_ids IS NULL
     OR array_length(_clinica_ids, 1) IS NULL
     OR (length(v_norm) < 2 AND length(v_digits) < 2) THEN
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT m.clinica_id) INTO v_allowed
    FROM public.clinica_memberships m
   WHERE m.user_id = auth.uid() AND m.ativo = true
     AND m.clinica_id = ANY(_clinica_ids);
  IF v_allowed IS NULL THEN RETURN; END IF;

  v_is_num := (v_termo ~ '^[\d\s\.\-\/\(\)\+]+$') AND length(v_digits) >= 2;

  IF v_termo ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN v_data := v_termo::date; EXCEPTION WHEN OTHERS THEN v_data := null; END;
  ELSIF v_termo ~ '^\d{2}[\/\-]\d{2}[\/\-]\d{4}$' THEN
    BEGIN v_data := to_date(replace(v_termo, '-', '/'), 'DD/MM/YYYY'); EXCEPTION WHEN OTHERS THEN v_data := null; END;
  ELSIF length(v_digits) = 8 AND v_is_num THEN
    BEGIN v_data := to_date(v_digits, 'DDMMYYYY'); EXCEPTION WHEN OTHERS THEN v_data := null; END;
  END IF;

  v_tokens := regexp_split_to_array(v_norm, '\s+');

  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.nome, p.cpf, p.telefone, p.telefone2, p.data_nascimento,
           p.clinica_id, p.codigo_prontuario, p.codigo_prontuario_anterior,
           p.numero_pasta, p.email,
           regexp_replace(coalesce(p.cpf,''), '\D', '', 'g')       AS cpf_dig,
           regexp_replace(coalesce(p.telefone,''), '\D', '', 'g')  AS tel_dig,
           regexp_replace(coalesce(p.telefone2,''), '\D', '', 'g') AS tel2_dig,
           upper(public.strip_accents(coalesce(p.nome,'')))        AS nome_norm
      FROM public.pacientes p
     WHERE p.ativo = true
       AND p.clinica_id = ANY(v_allowed)
  ),
  scored AS (
    SELECT b.*,
      CASE
        WHEN v_is_num AND length(v_digits) = 11 AND b.cpf_dig = v_digits THEN 100
        WHEN v_is_num AND b.codigo_prontuario = v_digits THEN 95
        WHEN v_is_num AND b.codigo_prontuario_anterior = v_digits THEN 90
        WHEN v_is_num AND b.numero_pasta = v_digits THEN 88
        WHEN v_is_num AND length(v_digits) BETWEEN 8 AND 11
             AND (b.tel_dig = v_digits OR b.tel2_dig = v_digits) THEN 85
        WHEN v_data IS NOT NULL AND b.data_nascimento = v_data THEN 82
        WHEN b.nome_norm = v_norm THEN 80
        WHEN b.nome_norm LIKE v_norm || '%' THEN 60
        WHEN array_length(v_tokens, 1) > 0
             AND (SELECT bool_and(b.nome_norm LIKE '%' || t || '%')
                    FROM unnest(v_tokens) t WHERE length(t) >= 2) THEN 40
        WHEN v_is_num AND (
             b.cpf_dig LIKE v_digits || '%'
          OR b.tel_dig LIKE v_digits || '%'
          OR b.tel2_dig LIKE v_digits || '%'
          OR b.codigo_prontuario LIKE v_digits || '%'
          OR b.codigo_prontuario_anterior LIKE v_digits || '%'
          OR b.numero_pasta LIKE v_digits || '%'
        ) THEN 20
        ELSE 0
      END AS score
    FROM base b
  ),
  filtered AS (
    SELECT * FROM scored WHERE score > 0
    ORDER BY score DESC, nome_norm ASC
    LIMIT v_limite
  ),
  conv AS (
    SELECT DISTINCT ON (c.paciente_id)
           c.paciente_id, cv.nome AS convenio_nome
      FROM public.contratos_assinatura c
      LEFT JOIN public.cb_convenios cv ON cv.id = c.convenio_id
     WHERE c.paciente_id IN (SELECT f.id FROM filtered f)
       AND c.status = 'ativo'
     ORDER BY c.paciente_id, c.created_at DESC
  ),
  ult AS (
    SELECT a.paciente_id, MAX(a.data_hora::date) AS ultima
      FROM public.agendamentos a
     WHERE a.paciente_id IN (SELECT f.id FROM filtered f)
       AND a.status IN ('atendido','concluido','realizado','finalizado')
     GROUP BY a.paciente_id
  )
  SELECT
    f.id,
    f.nome,
    f.cpf,
    f.telefone,
    f.data_nascimento,
    f.clinica_id,
    f.codigo_prontuario,
    f.codigo_prontuario_anterior,
    f.numero_pasta,
    f.email,
    c.convenio_nome AS associado_convenio,
    u.ultima AS ultima_consulta,
    (f.telefone IS NULL OR f.cpf IS NULL OR f.data_nascimento IS NULL) AS cadastro_incompleto,
    f.score AS match_score,
    CASE f.score
      WHEN 100 THEN 'CPF exato'
      WHEN 95  THEN 'Prontuário exato'
      WHEN 90  THEN 'Código antigo exato'
      WHEN 88  THEN 'Pasta exata'
      WHEN 85  THEN 'Telefone exato'
      WHEN 82  THEN 'Data de nascimento'
      WHEN 80  THEN 'Nome exato'
      WHEN 60  THEN 'Nome começa com'
      WHEN 40  THEN 'Nome contém'
      WHEN 20  THEN 'Parcial'
      ELSE 'Outro'
    END AS match_reason
    FROM filtered f
    LEFT JOIN conv c ON c.paciente_id = f.id
    LEFT JOIN ult  u ON u.paciente_id = f.id
   ORDER BY f.score DESC, f.nome_norm ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.buscar_pacientes_global(uuid[], text, integer) TO authenticated;

-- 5) Duplicados
CREATE OR REPLACE VIEW public.v_pacientes_duplicados_suspeitos AS
WITH por_cpf AS (
  SELECT clinica_id, 'cpf'::text AS tipo, cpf AS chave,
         array_agg(id ORDER BY created_at) AS ids, count(*) AS qtd
    FROM public.pacientes
   WHERE ativo AND cpf IS NOT NULL AND length(cpf) >= 8
   GROUP BY clinica_id, cpf HAVING count(*) > 1
),
por_tel AS (
  SELECT clinica_id, 'telefone'::text, telefone,
         array_agg(id ORDER BY created_at), count(*)
    FROM public.pacientes
   WHERE ativo AND telefone IS NOT NULL AND length(telefone) >= 8
   GROUP BY clinica_id, telefone HAVING count(*) > 1
),
por_nome_dn AS (
  SELECT clinica_id, 'nome_dn'::text,
         upper(public.strip_accents(nome)) || '|' || data_nascimento::text,
         array_agg(id ORDER BY created_at), count(*)
    FROM public.pacientes
   WHERE ativo AND data_nascimento IS NOT NULL
   GROUP BY clinica_id, upper(public.strip_accents(nome)), data_nascimento
  HAVING count(*) > 1
)
SELECT * FROM por_cpf
UNION ALL SELECT * FROM por_tel
UNION ALL SELECT * FROM por_nome_dn;

CREATE OR REPLACE FUNCTION public.listar_duplicados_pacientes(
  _clinica_ids uuid[],
  _tipo text DEFAULT null,
  _limite integer DEFAULT 200
)
RETURNS TABLE (
  clinica_id uuid, tipo text, chave text,
  ids uuid[], qtd bigint, pacientes jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed uuid[];
BEGIN
  IF auth.uid() IS NULL OR _clinica_ids IS NULL THEN RETURN; END IF;
  SELECT array_agg(DISTINCT m.clinica_id) INTO v_allowed
    FROM public.clinica_memberships m
   WHERE m.user_id = auth.uid() AND m.ativo
     AND m.clinica_id = ANY(_clinica_ids);
  IF v_allowed IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT d.clinica_id, d.tipo, d.chave, d.ids, d.qtd,
    (SELECT jsonb_agg(jsonb_build_object(
              'id', p.id, 'nome', p.nome, 'cpf', p.cpf,
              'telefone', p.telefone, 'data_nascimento', p.data_nascimento,
              'codigo_prontuario', p.codigo_prontuario,
              'created_at', p.created_at
           ) ORDER BY p.created_at)
       FROM public.pacientes p WHERE p.id = ANY(d.ids)) AS pacientes
    FROM public.v_pacientes_duplicados_suspeitos d
   WHERE d.clinica_id = ANY(v_allowed)
     AND (_tipo IS NULL OR d.tipo = _tipo)
   ORDER BY d.qtd DESC, d.tipo, d.chave
   LIMIT least(greatest(coalesce(_limite,200),1), 1000);
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_duplicados_pacientes(uuid[], text, integer) TO authenticated;
GRANT SELECT ON public.v_pacientes_duplicados_suspeitos TO authenticated;
