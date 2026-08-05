
-- Drop broad anon policies exposing sensitive data
DROP POLICY IF EXISTS clinicas_public_select ON public.clinicas;
DROP POLICY IF EXISTS senhas_public_select ON public.senhas;
DROP POLICY IF EXISTS pacientes_public_totem_select ON public.pacientes;
DROP POLICY IF EXISTS pacientes_public_totem_insert ON public.pacientes;
DROP POLICY IF EXISTS biometria_public_totem_select ON public.paciente_biometria;
DROP POLICY IF EXISTS biometria_public_totem_insert ON public.paciente_biometria;

-- Resolver clínica pública (só campos seguros; sem token_publico, paytime_recipient_id, email, telefone)
CREATE OR REPLACE FUNCTION public.resolver_clinica_publica(_clinica_id uuid)
RETURNS TABLE(id uuid, nome text, cidade text, estado text, branding jsonb, base_importada boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT c.id, c.nome, c.cidade, c.estado, c.branding, c.base_importada
  FROM public.clinicas c
  WHERE c.id = _clinica_id;
$$;
REVOKE ALL ON FUNCTION public.resolver_clinica_publica(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolver_clinica_publica(uuid) TO anon, authenticated;

-- Painel público de senhas (só campos necessários para exibição na parede)
CREATE OR REPLACE FUNCTION public.painel_senhas_publicas(_clinica_id uuid)
RETURNS TABLE(
  id uuid,
  codigo text,
  tipo text,
  status text,
  guiche text,
  chamada_em timestamptz,
  paciente_id uuid,
  paciente_nome text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT
    s.id,
    s.codigo,
    s.tipo::text,
    s.status::text,
    s.guiche,
    s.chamada_em,
    s.paciente_id,
    -- Apenas primeiro nome + inicial do sobrenome para preservar privacidade
    CASE
      WHEN p.nome IS NULL OR btrim(p.nome) = '' THEN NULL
      ELSE split_part(p.nome, ' ', 1) ||
           CASE WHEN split_part(p.nome, ' ', 2) <> ''
             THEN ' ' || left(split_part(p.nome, ' ', 2), 1) || '.'
             ELSE '' END
    END AS paciente_nome
  FROM public.senhas s
  LEFT JOIN public.pacientes p ON p.id = s.paciente_id
  WHERE s.clinica_id = _clinica_id
    AND s.data_dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    AND s.status::text IN ('chamada','atendida')
  ORDER BY s.chamada_em DESC NULLS LAST
  LIMIT 6;
$$;
REVOKE ALL ON FUNCTION public.painel_senhas_publicas(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.painel_senhas_publicas(uuid) TO anon, authenticated;

-- Totem: reconhecimento facial server-side (não expõe descriptors ao cliente)
CREATE OR REPLACE FUNCTION public.totem_match_biometria(
  _clinica_id uuid,
  _descriptor jsonb,
  _threshold float DEFAULT 0.6
)
RETURNS TABLE(paciente_id uuid, nome text, distancia float)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
  v_query float[];
BEGIN
  IF _descriptor IS NULL OR jsonb_typeof(_descriptor) <> 'array'
     OR jsonb_array_length(_descriptor) <> 128 THEN
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
  WHERE c.dist <= _threshold
  ORDER BY c.dist ASC
  LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.totem_match_biometria(uuid, jsonb, float) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.totem_match_biometria(uuid, jsonb, float) TO anon, authenticated;

-- Totem: cadastro / associação de biometria (single entry point, valida entrada)
CREATE OR REPLACE FUNCTION public.totem_upsert_paciente(
  _clinica_id uuid,
  _nome text,
  _cpf text DEFAULT NULL,
  _telefone text DEFAULT NULL,
  _descriptor jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE
AS $$
DECLARE
  v_id uuid;
  v_nome text := btrim(coalesce(_nome, ''));
  v_cpf text := nullif(btrim(coalesce(_cpf, '')), '');
  v_tel text := nullif(btrim(coalesce(_telefone, '')), '');
BEGIN
  IF _clinica_id IS NULL THEN
    RAISE EXCEPTION 'clinica_id obrigatório';
  END IF;
  IF length(v_nome) < 2 OR length(v_nome) > 200 THEN
    RAISE EXCEPTION 'Nome inválido';
  END IF;
  IF v_cpf IS NOT NULL AND length(v_cpf) NOT BETWEEN 11 AND 14 THEN
    RAISE EXCEPTION 'CPF inválido';
  END IF;
  IF v_tel IS NOT NULL AND length(v_tel) > 30 THEN
    RAISE EXCEPTION 'Telefone inválido';
  END IF;

  IF v_cpf IS NOT NULL THEN
    SELECT id INTO v_id
      FROM public.pacientes
     WHERE clinica_id = _clinica_id AND cpf = v_cpf
     LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.pacientes(clinica_id, nome, cpf, telefone, consentimento_lgpd_em)
      VALUES (_clinica_id, v_nome, v_cpf, v_tel, now())
      RETURNING id INTO v_id;
  END IF;

  IF _descriptor IS NOT NULL
     AND jsonb_typeof(_descriptor) = 'array'
     AND jsonb_array_length(_descriptor) = 128 THEN
    INSERT INTO public.paciente_biometria(clinica_id, paciente_id, descriptor)
      VALUES (_clinica_id, v_id, _descriptor);
  END IF;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.totem_upsert_paciente(uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.totem_upsert_paciente(uuid, text, text, text, jsonb) TO anon, authenticated;
