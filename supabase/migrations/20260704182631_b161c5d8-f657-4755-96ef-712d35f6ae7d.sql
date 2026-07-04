
-- 1) Top procedimentos mais solicitados
CREATE OR REPLACE FUNCTION public.top_procedimentos_agendamento(
  _clinica_id uuid,
  _limit int DEFAULT 10,
  _janela_dias int DEFAULT 90,
  _especialidade_id uuid DEFAULT NULL,
  _tipo text DEFAULT NULL
)
RETURNS TABLE (
  procedimento_id uuid,
  nome text,
  tipo text,
  grupo text,
  quantidade bigint,
  ultimo_uso timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH usados AS (
    SELECT lower(trim(a.procedimento)) AS nome_norm,
           count(*) AS qtd,
           max(a.inicio) AS ultimo
      FROM public.agendamentos a
     WHERE a.clinica_id = _clinica_id
       AND a.procedimento IS NOT NULL
       AND a.procedimento <> ''
       AND a.inicio >= now() - make_interval(days => _janela_dias)
     GROUP BY 1
  ),
  ranked AS (
    SELECT p.id AS procedimento_id,
           p.nome,
           p.tipo,
           p.grupo,
           u.qtd,
           u.ultimo
      FROM usados u
      JOIN public.procedimentos p
        ON p.clinica_id = _clinica_id
       AND p.ativo = true
       AND lower(trim(p.nome)) = u.nome_norm
       AND (_tipo IS NULL OR p.tipo = _tipo)
       AND (_especialidade_id IS NULL OR EXISTS (
            SELECT 1 FROM public.procedimento_especialidades pe
             WHERE pe.procedimento_id = p.id
               AND pe.especialidade_id = _especialidade_id
          ))
    UNION ALL
    SELECT p.id, p.nome, p.tipo, p.grupo, 0::bigint, NULL::timestamptz
      FROM public.procedimentos p
     WHERE p.clinica_id = _clinica_id
       AND p.ativo = true
       AND (_tipo IS NULL OR p.tipo = _tipo)
       AND (_especialidade_id IS NULL OR EXISTS (
            SELECT 1 FROM public.procedimento_especialidades pe
             WHERE pe.procedimento_id = p.id
               AND pe.especialidade_id = _especialidade_id
          ))
  ),
  agg AS (
    SELECT procedimento_id,
           max(nome) AS nome,
           max(tipo) AS tipo,
           max(grupo) AS grupo,
           sum(qtd) AS quantidade,
           max(ultimo) AS ultimo_uso
      FROM ranked
     GROUP BY procedimento_id
  )
  SELECT procedimento_id, nome, tipo, grupo, quantidade, ultimo_uso
    FROM agg
   ORDER BY quantidade DESC NULLS LAST, ultimo_uso DESC NULLS LAST, nome
   LIMIT greatest(_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.top_procedimentos_agendamento(uuid,int,int,uuid,text) TO authenticated, service_role;

-- 2) Pendências de cadastro por paciente
CREATE OR REPLACE FUNCTION public.paciente_pendencias_cadastro(_paciente_id uuid)
RETURNS TABLE (
  contato_ok boolean,
  documentacao_ok boolean,
  endereco_ok boolean,
  nfse_ok boolean,
  faltantes text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.pacientes%ROWTYPE;
  falt text[] := ARRAY[]::text[];
  v_contato boolean;
  v_doc boolean;
  v_end boolean;
  v_nfse boolean;
BEGIN
  SELECT * INTO p FROM public.pacientes WHERE id = _paciente_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, false, false, ARRAY['paciente_nao_encontrado']::text[];
    RETURN;
  END IF;

  IF p.telefone IS NULL OR length(regexp_replace(coalesce(p.telefone,''),'\D','','g')) < 10 THEN
    falt := array_append(falt,'telefone');
  END IF;
  v_contato := NOT ('telefone' = ANY(falt));

  IF p.cpf IS NULL OR length(regexp_replace(coalesce(p.cpf,''),'\D','','g')) <> 11 THEN
    falt := array_append(falt,'cpf');
  END IF;
  IF p.data_nascimento IS NULL THEN
    falt := array_append(falt,'data_nascimento');
  END IF;
  v_doc := NOT ('cpf' = ANY(falt) OR 'data_nascimento' = ANY(falt));

  IF p.cep IS NULL OR length(regexp_replace(coalesce(p.cep,''),'\D','','g')) <> 8 THEN
    falt := array_append(falt,'cep');
  END IF;
  IF coalesce(trim(p.logradouro),'') = '' THEN falt := array_append(falt,'logradouro'); END IF;
  IF coalesce(trim(p.numero),'') = '' THEN falt := array_append(falt,'numero'); END IF;
  IF coalesce(trim(p.bairro),'') = '' THEN falt := array_append(falt,'bairro'); END IF;
  IF coalesce(trim(p.cidade),'') = '' THEN falt := array_append(falt,'cidade'); END IF;
  IF coalesce(trim(p.estado),'') = '' THEN falt := array_append(falt,'estado'); END IF;
  v_end := NOT (('cep' = ANY(falt)) OR ('logradouro' = ANY(falt)) OR ('numero' = ANY(falt))
                OR ('bairro' = ANY(falt)) OR ('cidade' = ANY(falt)) OR ('estado' = ANY(falt)));

  IF coalesce(trim(p.email),'') = '' THEN
    falt := array_append(falt,'email');
  END IF;
  v_nfse := v_contato AND v_doc AND v_end AND NOT ('email' = ANY(falt));

  RETURN QUERY SELECT v_contato, v_doc, v_end, v_nfse, falt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.paciente_pendencias_cadastro(uuid) TO authenticated, service_role;

-- 3) Trigger telefone obrigatório (não altera linhas existentes; só bloqueia novas gravações sem telefone)
CREATE OR REPLACE FUNCTION public.pacientes_require_telefone_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  digits text;
BEGIN
  digits := regexp_replace(coalesce(NEW.telefone,''),'\D','','g');
  IF length(digits) < 10 THEN
    -- Em UPDATE, se telefone antigo também era vazio (linha legada), permite salvar edições em outros campos
    IF TG_OP = 'UPDATE' THEN
      IF length(regexp_replace(coalesce(OLD.telefone,''),'\D','','g')) < 10 THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION 'Telefone é obrigatório (mínimo 10 dígitos)'
      USING ERRCODE = 'check_violation', HINT = 'Informe DDD + número';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pacientes_require_telefone_bi ON public.pacientes;
CREATE TRIGGER pacientes_require_telefone_bi
BEFORE INSERT OR UPDATE OF telefone ON public.pacientes
FOR EACH ROW EXECUTE FUNCTION public.pacientes_require_telefone_fn();
