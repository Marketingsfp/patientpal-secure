-- Parte 5 da correcao da busca colada: buscar_pacientes.
--
-- Esta e a que mais aparece no dia a dia: alimenta a barra de busca do topo do
-- sistema (app-shell) e a lista de Clientes. Ficou de fora das partes 1 e 2
-- porque ela quebra o nome em palavras com regexp_split_to_array(v_norm, '\s+')
-- e junta com '%', o que ja absorve espaco repetido.
--
-- So que '\s' no Postgres nao cobre o espaco duro (NBSP, U+00A0) nem os
-- caracteres de largura zero -- e sao exatamente esses que vem ao copiar de
-- pagina web, de PDF e do WhatsApp. Nesses casos o token fica "MARIA\u00A0DA",
-- o LIKE vira '%MARIA\u00A0DA%SILVA%' e nao casa com "MARIA DA SILVA".
-- O paciente existe e some da busca.
--
-- Unica mudanca: a linha do DECLARE que prepara o termo, que agora passa por
-- public.normalizar_termo_busca. O restante do corpo e copia exata da
-- definicao que esta em producao hoje (md5 f94bbad353a2f924ef0cc941a311a70a).
-- Nada e gravado: a funcao segue STABLE, somente leitura.

CREATE OR REPLACE FUNCTION public.buscar_pacientes(_clinica_id uuid, _termo text, _limit integer DEFAULT 80, _offset integer DEFAULT 0)
 RETURNS SETOF pacientes
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- A limpeza vem antes de tudo: remove espaco duro, espaco repetido,
  -- tabulacao, quebra de linha e caractere de largura zero.
  v_termo text := public.normalizar_termo_busca(_termo);
  v_norm text;
  v_digits text;
  v_tokens text[];
  v_pattern text;
  v_data_iso date;
  v_limit integer := LEAST(GREATEST(_limit, 1), 500);
  v_offset integer := GREATEST(COALESCE(_offset, 0), 0);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.clinica_id = _clinica_id AND m.user_id = auth.uid() AND m.ativo = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF length(v_termo) = 0 THEN
    RETURN QUERY SELECT * FROM public.pacientes
      WHERE clinica_id = _clinica_id AND ativo = true
      ORDER BY nome LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  v_digits := regexp_replace(v_termo, '\D', '', 'g');
  v_norm := upper(public.strip_accents(v_termo));

  IF v_termo ~ '^\d{2}/\d{2}/\d{4}$' THEN
    v_data_iso := to_date(v_termo, 'DD/MM/YYYY');
    RETURN QUERY SELECT * FROM public.pacientes
      WHERE clinica_id = _clinica_id AND ativo = true AND data_nascimento = v_data_iso
      ORDER BY nome LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  IF v_digits = v_termo AND length(v_digits) >= 3 THEN
    RETURN QUERY
      SELECT * FROM public.pacientes
      WHERE clinica_id = _clinica_id AND ativo = true
        AND (
          cpf_digits LIKE v_digits || '%'
          OR codigo_prontuario LIKE v_digits || '%'
          OR numero_pasta LIKE v_digits || '%'
          OR codigo_prontuario_anterior LIKE v_digits || '%'
          OR telefone LIKE '%' || v_digits || '%'
          OR telefone2 LIKE '%' || v_digits || '%'
        )
      ORDER BY nome LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  IF v_termo LIKE '%@%' AND length(v_termo) >= 5 THEN
    RETURN QUERY
      SELECT * FROM public.pacientes
      WHERE clinica_id = _clinica_id AND ativo = true
        AND email ILIKE '%' || v_termo || '%'
      ORDER BY nome LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  v_tokens := regexp_split_to_array(v_norm, '\s+');
  v_pattern := '%' || array_to_string(v_tokens, '%') || '%';

  RETURN QUERY
    SELECT * FROM public.pacientes
    WHERE clinica_id = _clinica_id AND ativo = true
      AND upper(public.strip_accents(nome)) LIKE v_pattern
    ORDER BY nome LIMIT v_limit OFFSET v_offset;
END;
$function$;
