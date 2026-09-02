-- Tela de Contratos: prontuario do cadastro na frente do herdado.
--
-- ================================ CONTEXTO =================================
-- Em 02/09/2026 o dono fechou a regra de exibicao do prontuario conferindo
-- tres cadastros contra o papel: GILBERTO ALEXANDRINO DA SILVA (2430133,
-- aparecia 378132), VANILDA DOS SANTOS VENTURA (1348, aparecia 194897) e LAIZ
-- DA COSTA PIRES (1644, aparecia 84297).
--
-- O numero que vale e o que a recepcao digita e confere no campo "Numero de
-- prontuario" do cadastro. O codigo herdado da importacao de junho/2026 so
-- aparece quando o campo principal esta vazio -- na pratica quase nunca, ja
-- que o banco gera numero automatico em todo cadastro novo.
--
-- Esta funcao alimenta a lista da tela de Contratos e precisa seguir a mesma
-- ordem de src/lib/prontuario.ts (prontuarioExibicao), senao o mesmo paciente
-- aparece com um numero na lista e outro na guia impressa.
--
-- ================================ A MUDANCA ================================
-- A ordem do COALESCE de saida passa a ser codigo_prontuario, numero_pasta,
-- codigo_prontuario_anterior. Assinatura, colunas, tipos e ordem continuam
-- iguais -- a tela nao precisa de ajuste.
--
-- A BUSCA nao muda: ela ja compara as tres colunas separadamente, entao quem
-- chega com guia ou cartao antigo continua sendo encontrado pelo numero velho.
-- Nada e gravado: a funcao segue STABLE, somente leitura.
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
      NULLIF(btrim(pac.codigo_prontuario), ''),
      NULLIF(btrim(pac.numero_pasta), ''),
      pac.codigo_prontuario_anterior
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
