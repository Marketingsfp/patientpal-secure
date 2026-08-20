-- Tela de Contratos: mostrar o prontuario HISTORICO, e nao o numero interno.
--
-- ================================ CONTEXTO =================================
-- A importacao do sistema antigo (migration 20260615163212) gravou a numeracao
-- historica de cada paciente em `pacientes.codigo_prontuario_anterior` e gerou
-- um numero interno novo, sequencial, em `pacientes.codigo_prontuario`. Hoje
-- 242.227 dos 252.062 pacientes tem numeracao historica, e em 241.261 deles ela
-- e DIFERENTE do numero interno -- por isso a recepcao via na tela um numero que
-- nao batia com a ficha de papel.
--
-- O restante do sistema passou a exibir a numeracao historica pela funcao
-- `prontuarioExibicao` (src/lib/prontuario.ts). Esta funcao do banco alimenta a
-- lista da tela de Contratos e precisa seguir a mesma regra.
--
-- ================================ A MUDANCA ================================
-- Uma unica linha muda: a coluna de saida `codigo_prontuario` passa a devolver
-- a numeracao historica quando ela existe, caindo no numero interno quando nao
-- existe (paciente cadastrado ja no sistema novo).
--
-- A ASSINATURA NAO MUDA -- mesmas colunas, mesmos tipos, mesma ordem. A tela
-- nao precisa de ajuste e nada quebra se esta migration for aplicada antes ou
-- depois do deploy do frontend.
--
-- O QUE NAO MUDA: a BUSCA continua comparando as colunas reais separadamente
-- (`p.codigo_prontuario = v_digits OR p.codigo_prontuario_anterior = v_digits`),
-- entao digitar o numero antigo ou o interno continua encontrando o contrato.
-- Nenhum dado e gravado: a funcao segue STABLE, somente leitura.

CREATE OR REPLACE FUNCTION public.buscar_contratos(
  _clinica_id uuid,
  _termo text DEFAULT ''::text,
  _limit integer DEFAULT 50
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
  -- A tela pede 50 na busca por texto e 500 na listagem sem termo (os filtros
  -- de coluna trabalham em cima do que foi carregado).
  v_limit integer := LEAST(GREATEST(COALESCE(_limit, 50), 1), 500);
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.clinica_id = _clinica_id AND m.user_id = auth.uid() AND m.ativo = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_digits := regexp_replace(v_termo, '\D', '', 'g');
  -- "Busca por numero" e todo termo SEM LETRA: cobre 20261941, 192735 e
  -- tambem o CPF digitado com pontuacao (923.054.157-53), que a recepcao
  -- costuma colar da carteirinha.
  v_so_digitos := (v_digits <> '' AND v_termo !~ '[[:alpha:]]');

  -- Numero do contrato: so converte se couber num integer (um CPF digitado
  -- inteiro estouraria o tipo e derrubaria a busca).
  v_numero := CASE
    WHEN v_so_digitos AND length(v_digits) <= 9 THEN v_digits::integer
    ELSE NULL
  END;

  -- Padrao de nome: uma palavra por pedaco, sem acento e em maiusculas, para
  -- "MARIA SILVA" encontrar tambem "MARIA DA SILVA".
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
        -- Sem termo: listagem normal, os mais recentes primeiro.
        v_termo = ''

        -- So numeros: numero do contrato ou identificador do paciente.
        OR (
          v_so_digitos AND (
            (v_numero IS NOT NULL AND c.numero = v_numero)
            OR p.codigo_prontuario = v_digits
            OR p.codigo_prontuario_anterior = v_digits
            OR p.numero_pasta = v_digits
            -- CPF a partir de 3 digitos; com menos, o resultado seria ruido.
            OR (length(v_digits) >= 3 AND p.cpf_digits LIKE '%' || v_digits || '%')
          )
        )

        -- Texto: nome. Duas fontes, porque o nome gravado no contrato e um
        -- retrato historico e em contratos antigos veio truncado (ex.: "MARIA
        -- CRISTINA DE SOUZA D") -- por isso o nome ATUAL do paciente tambem
        -- entra, senao o contrato certo nao aparece.
        OR (
          v_pattern IS NOT NULL AND (
            upper(public.strip_accents(c.paciente_nome)) LIKE v_pattern
            OR upper(public.strip_accents(p.nome)) LIKE v_pattern
          )
        )
      )
    ORDER BY c.created_at DESC
    LIMIT v_limit
  )
  SELECT
    to_jsonb(c)                   AS contrato,
    -- UNICA MUDANCA DESTA MIGRATION: numeracao historica primeiro. Espelha
    -- `prontuarioExibicao` em src/lib/prontuario.ts.
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
    -- Ciclo atual = as 12 parcelas de maior numero (renovacoes acrescentam
    -- 13..24, 25..36...). Parcela <= 0 e adesao/taxa e nao entra na contagem.
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
  ORDER BY c.created_at DESC;
END;
$function$;

-- Le dados pessoais de paciente: fechada para visitante anonimo.
REVOKE ALL ON FUNCTION public.buscar_contratos(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_contratos(uuid, text, integer) TO authenticated;
