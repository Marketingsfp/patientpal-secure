-- 1. Coluna base_importada por clínica
ALTER TABLE public.clinicas ADD COLUMN IF NOT EXISTS base_importada boolean NOT NULL DEFAULT false;

-- Marca base importada da Menino Jesus
UPDATE public.clinicas SET base_importada = true WHERE id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940';

-- 2. Função para verificar se paciente existe (por CPF, telefone ou nome)
-- e se é associado (contrato ativo em contratos_assinatura)
CREATE OR REPLACE FUNCTION public.buscar_paciente_contato(
  _clinica_id uuid,
  _cpf text DEFAULT NULL,
  _telefone text DEFAULT NULL,
  _nome text DEFAULT NULL
) RETURNS TABLE(
  id uuid,
  nome text,
  cpf text,
  telefone text,
  data_nascimento date,
  associado boolean,
  convenio_id uuid,
  convenio_nome text,
  contrato_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cpf_digits text := NULLIF(regexp_replace(COALESCE(_cpf,''), '\D', '', 'g'), '');
  v_tel_digits text := NULLIF(regexp_replace(COALESCE(_telefone,''), '\D', '', 'g'), '');
  v_nome_norm  text := NULLIF(upper(public.strip_accents(trim(COALESCE(_nome,'')))), '');
BEGIN
  IF _clinica_id IS NULL THEN RETURN; END IF;
  IF v_cpf_digits IS NULL AND v_tel_digits IS NULL AND v_nome_norm IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH cand AS (
    SELECT p.*
    FROM public.pacientes p
    WHERE p.clinica_id = _clinica_id
      AND p.ativo = true
      AND (
        (v_cpf_digits IS NOT NULL AND p.cpf_digits = v_cpf_digits)
        OR (v_tel_digits IS NOT NULL AND (
              regexp_replace(COALESCE(p.telefone,''), '\D','','g') LIKE '%' || v_tel_digits
              OR regexp_replace(COALESCE(p.telefone2,''), '\D','','g') LIKE '%' || v_tel_digits
           ))
        OR (v_nome_norm IS NOT NULL AND p.nome LIKE v_nome_norm || '%')
      )
    ORDER BY
      CASE WHEN v_cpf_digits IS NOT NULL AND p.cpf_digits = v_cpf_digits THEN 0
           WHEN v_tel_digits IS NOT NULL THEN 1
           ELSE 2 END,
      p.nome
    LIMIT 5
  )
  SELECT c.id, c.nome, c.cpf, c.telefone, c.data_nascimento,
         (ca.id IS NOT NULL) AS associado,
         cv.id, cv.nome, ca.id
  FROM cand c
  LEFT JOIN LATERAL (
    SELECT ca.id, ca.convenio_id
    FROM public.contratos_assinatura ca
    WHERE ca.status = 'ativo'
      AND ca.clinica_id = _clinica_id
      AND (
        ca.paciente_id = c.id
        OR EXISTS (
          SELECT 1 FROM public.contrato_dependentes d
          WHERE d.contrato_id = ca.id AND d.paciente_id = c.id AND d.ativo
        )
      )
    ORDER BY ca.created_at DESC
    LIMIT 1
  ) ca ON true
  LEFT JOIN public.cb_convenios cv ON cv.id = ca.convenio_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_paciente_contato(uuid, text, text, text) TO authenticated, anon, service_role;