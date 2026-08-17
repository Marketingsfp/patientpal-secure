-- Busca da tela de Contratos: de 5 idas ao banco (uma delas varrendo os
-- 251.914 pacientes) para UMA chamada, medida em 54 ms.
--
-- ============================ O QUE ESTAVA ERRADO ============================
-- Cada busca disparava, em fila:
--   1. pacientes .or(nome ilike %termo%, cpf ilike %digitos%, codigo_prontuario,
--      codigo_prontuario_anterior, numero_pasta)   -- limite 200
--   2. contratos_assinatura .or(paciente_nome ilike, numero, paciente_id in (...))
--   3. pacientes DE NOVO, so para trazer codigo_prontuario
--   4. contrato_mensalidades em lotes
--   5. profiles (nome do vendedor)
--
-- A consulta 1 era a cara, e o diagnostico surpreende: NAO faltava indice. Os
-- indices de nome, CPF, prontuario e pasta ja existiam. O que impedia o uso
-- deles era a forma da consulta, confirmado com EXPLAIN ANALYZE na base real:
--
--   a) todos os indices de nome de pacientes sao PARCIAIS (WHERE ativo) e a
--      consulta nao filtrava `ativo`, entao nenhum podia ser escolhido;
--   b) o OR de 5 colunas num WHERE unico obriga o planejador a varrer a tabela
--      inteira, porque nao existe indice que atenda as 5 ao mesmo tempo;
--   c) e o mais importante: a busca partia da tabela GRANDE (251.914 pacientes)
--      para depois cruzar com a pequena. O certo e o contrario -- so existem
--      1.777 contratos, e varrer 1.777 linhas buscando o paciente de cada uma
--      pela chave primaria e sempre barato.
--
-- Medicoes na base de producao (mesmo servidor, cache quente):
--   pacientes: nome ilike '%MARIA SILVA%' sem `ativo` ....... 141 ms (seq scan)
--   pacientes: OR das 5 colunas, como estava ................ 191 ms (seq scan)
--   partindo dos pacientes com indice trigrama + IN .......... 837 ms no termo
--     "SILVA" (64.871 pacientes casam; o custo explode com termos comuns)
--   partindo dos contratos (esta migration) ................. 49-54 ms, e o
--     tempo NAO depende de quao comum e o termo, porque sempre sao as mesmas
--     1.777 linhas.
--
-- =============================== A CORRECAO ================================
-- Uma funcao que resolve tudo do lado do servidor:
--   * varre os contratos da clinica e busca o paciente de cada um pela chave
--     primaria -- barato e com tempo estavel para qualquer termo;
--   * separa a busca por numeros da busca por nome, em vez de misturar as duas;
--   * ja devolve o prontuario, o nome do vendedor e a contagem de parcelas do
--     ciclo atual, eliminando as consultas 3, 4 e 5;
--   * corta o resultado com LIMIT no proprio banco.
--
-- NENHUM INDICE NOVO E NECESSARIO. Acrescentar indice aqui so acrescentaria
-- custo de escrita sem ganho de leitura: com 1.777 linhas o planejador nao usa.
--
-- ============================== COMPATIBILIDADE =============================
-- O contrato volta como jsonb (to_jsonb da linha inteira), entao a tela recebe
-- exatamente as mesmas colunas de antes -- e nao quebra se a tabela ganhar
-- campos novos.
--
-- Diferenca de comportamento, unica e proposital: "parcela atrasada" passa a
-- usar a data de Sao Paulo, e nao a data UTC que o navegador calculava. Entre
-- 21h e meia-noite o horario UTC ja estava no dia seguinte e uma parcela que
-- vence hoje aparecia como atrasada.
--
-- ================================ SEGURANCA ================================
-- STABLE (somente leitura) e SECURITY DEFINER com a mesma checagem de vinculo
-- usada em buscar_pacientes: quem nao for membro ativo da clinica recebe erro.
-- Nada e gravado. Fechada para visitante anonimo, liberada so para usuario
-- autenticado.

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
    pac.codigo_prontuario         AS codigo_prontuario,
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

ANALYZE public.contratos_assinatura;
