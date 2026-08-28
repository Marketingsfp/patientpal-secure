-- Paginação na busca de contratos.
--
-- Problema que resolve: `buscar_contratos` sempre devolvia os N contratos mais
-- recentes por `created_at`, com N no máximo 500. Os filtros da tela (período,
-- convênio, vendedor, situação…) rodam DEPOIS, no navegador, em cima do que
-- veio — então filtravam um recorte, não a base.
--
-- Efeito concreto em 28/08/2026: o filtro "Últimos 30 dias" mostrava
-- "1–22 de 22 contratos" quando existiam 29 contratos que atendiam ao filtro.
-- Os outros 7 nunca chegaram ao navegador, porque não estavam entre os 500
-- mais recentes. A frase afirmava um total que não era o total.
--
-- A correção é só acrescentar `_offset`, para a tela pedir a base em páginas
-- até acabar. A consulta em si não muda em nada: mesma ordenação, mesmos
-- campos, mesma regra de permissão.
--
-- A função antiga (3 argumentos) é removida e recriada com 4. Se as duas
-- coexistissem, uma chamada com 3 argumentos ficaria ambígua para o PostgREST
-- ("could not choose the best candidate function"). Como `_offset` tem valor
-- padrão, qualquer chamada antiga de 3 argumentos continua funcionando.

DROP FUNCTION IF EXISTS public.buscar_contratos(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.buscar_contratos(
  _clinica_id uuid,
  _termo text DEFAULT ''::text,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  contrato jsonb,
  codigo_prontuario text,
  parcelas_pagas integer,
  parcelas_total integer,
  parcela_atrasada boolean,
  vendedor_nome text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_termo text := COALESCE(trim(_termo), '');
  v_digits text;
  v_pattern text;
  v_numero integer;
  v_so_digitos boolean;
  v_limit integer := LEAST(GREATEST(COALESCE(_limit, 50), 1), 500);
  -- Offset não tem teto: a tela pagina até a base acabar. O que limita o
  -- volume é o `v_limit` de cada página.
  v_offset integer := GREATEST(COALESCE(_offset, 0), 0);
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.clinica_id = _clinica_id AND m.user_id = auth.uid() AND m.ativo = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_digits := regexp_replace(v_termo, '\D', '', 'g');
  v_so_digitos := (v_digits <> '' AND v_termo !~ '[[:alpha:]]');

  v_numero := CASE
    WHEN v_so_digitos AND length(v_digits) <= 9 THEN v_digits::integer
    ELSE NULL
  END;

  v_pattern := CASE
    WHEN v_so_digitos OR v_termo = '' THEN NULL
    ELSE '%' || array_to_string(
      regexp_split_to_array(upper(public.strip_accents(v_termo)), '\s+'), '%'
    ) || '%'
  END;

  RETURN QUERY
  WITH alvo AS (
    SELECT c.id, c.created_at
    FROM public.contratos_assinatura c
    LEFT JOIN public.pacientes p ON p.id = c.paciente_id
    WHERE c.clinica_id = _clinica_id
      AND (
        v_termo = ''
        OR (
          v_so_digitos AND (
            (v_numero IS NOT NULL AND c.numero = v_numero)
            OR p.codigo_prontuario = v_digits
            OR p.codigo_prontuario_anterior = v_digits
            OR p.numero_pasta = v_digits
            OR (length(v_digits) >= 3 AND p.cpf_digits LIKE '%' || v_digits || '%')
          )
        )
        OR (
          v_pattern IS NOT NULL AND (
            upper(public.strip_accents(c.paciente_nome)) LIKE v_pattern
            OR upper(public.strip_accents(p.nome)) LIKE v_pattern
          )
        )
      )
    -- `id` no desempate: sem ele, contratos com o MESMO created_at (a
    -- importação em massa criou centenas no mesmo instante) podiam trocar de
    -- lugar entre uma página e outra, repetindo um contrato e escondendo
    -- outro. Com a ordenação estável isso não acontece.
    ORDER BY c.created_at DESC, c.id
    LIMIT v_limit OFFSET v_offset
  )
  SELECT
    to_jsonb(c)                   AS contrato,
    COALESCE(
      NULLIF(btrim(pac.codigo_prontuario_anterior), ''),
      pac.codigo_prontuario
    )                             AS codigo_prontuario,
    COALESCE(a.pagas, 0)::integer AS parcelas_pagas,
    COALESCE(a.total, 0)::integer AS parcelas_total,
    COALESCE(a.atrasada, false)   AS parcela_atrasada,
    prof.nome                     AS vendedor_nome
  FROM alvo
  JOIN public.contratos_assinatura c ON c.id = alvo.id
  LEFT JOIN public.pacientes pac ON pac.id = c.paciente_id
  LEFT JOIN public.profiles prof ON prof.id = c.criado_por
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE m.status = 'pago') AS pagas,
      count(*)                                  AS total,
      bool_or(
        m.status <> 'pago' AND m.vencimento IS NOT NULL AND m.vencimento < v_hoje
      )                                         AS atrasada
    FROM (
      SELECT m2.status, m2.vencimento
      FROM public.contrato_mensalidades m2
      WHERE m2.contrato_id = c.id AND m2.numero_parcela > 0
      ORDER BY m2.numero_parcela DESC
      LIMIT 12
    ) m
  ) a ON true
  ORDER BY c.created_at DESC, c.id;
END;
$function$;

-- Le dados pessoais de paciente: fechada para visitante anonimo.
REVOKE ALL ON FUNCTION public.buscar_contratos(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_contratos(uuid, text, integer, integer) TO authenticated;
