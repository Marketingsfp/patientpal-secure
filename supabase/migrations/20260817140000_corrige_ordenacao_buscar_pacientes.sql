-- Corrige a busca de pacientes: ordenar ANTES de cortar.
--
-- PROBLEMA
-- Cada ramo de buscar_pacientes aplicava um LIMIT interno (ate 2.000 linhas)
-- ANTES do ORDER BY nome. Com 251.911 pacientes numa clinica, buscar "MARIA"
-- (21.325 correspondencias reais) devolvia 2.000 linhas ARBITRARIAS -- as
-- primeiras que o banco encontrasse, sem criterio -- ordenava apenas essas e
-- mostrava 500. Consequencias:
--   1. Um paciente realmente cadastrado frequentemente nao aparecia na busca.
--   2. Duas buscas identicas podiam devolver resultados diferentes, porque a
--      ordem de varredura do banco nao e garantida.
-- A recepcao concluia "esse paciente nao esta cadastrado" e criava o cadastro
-- de novo. O banco ja tem 1.724 grupos de pacientes duplicados (mesmo nome e
-- mesma data de nascimento), somando 1.738 cadastros repetidos.
--
-- CORRECAO
-- Remover os LIMIT internos de todos os ramos. O ORDER BY nome passa a valer
-- sobre TODAS as correspondencias, e o LIMIT/OFFSET corta o resultado ja
-- ordenado. A busca vira completa, estavel (mesmo termo = mesmo resultado) e
-- paginavel de verdade.
--
-- DESEMPENHO -- medido em producao, na base real de 251.911 pacientes,
-- usando os indices que JA existem (idx_pacientes_nome_norm_trgm para o filtro
-- por nome e idx_pacientes_clinica_ativo_nome_only para a listagem):
--   "MARIA SILVA"  (5.622 correspondencias) .....................   93 ms
--   "SILVA"       (64.871 correspondencias, pior caso da base) ...  880 ms
--   lista sem termo, ultima pagina (offset 251.000) ..............  264 ms
-- Nenhum indice novo e necessario.
--
-- SEGURANCA E DADOS
-- A funcao continua STABLE (somente leitura) e SECURITY DEFINER com a mesma
-- checagem de vinculo do usuario com a clinica. Nada e gravado. Os
-- identificadores legados (codigo_prontuario, codigo_prontuario_anterior,
-- numero_pasta) seguem sendo usados apenas como criterio de leitura, nunca de
-- escrita, conforme a restricao de dados historicos da clinica.

CREATE OR REPLACE FUNCTION public.buscar_pacientes(_clinica_id uuid, _termo text, _limit integer DEFAULT 80, _offset integer DEFAULT 0)
 RETURNS SETOF pacientes
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_termo text := COALESCE(trim(_termo), '');
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

  -- Sem termo: listagem alfabetica completa, paginada por LIMIT/OFFSET.
  IF length(v_termo) = 0 THEN
    RETURN QUERY SELECT * FROM public.pacientes
      WHERE clinica_id = _clinica_id AND ativo = true
      ORDER BY nome LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  v_digits := regexp_replace(v_termo, '\D', '', 'g');
  v_norm := upper(public.strip_accents(v_termo));

  -- Data de nascimento (dd/mm/aaaa).
  IF v_termo ~ '^\d{2}/\d{2}/\d{4}$' THEN
    v_data_iso := to_date(v_termo, 'DD/MM/YYYY');
    RETURN QUERY SELECT * FROM public.pacientes
      WHERE clinica_id = _clinica_id AND ativo = true AND data_nascimento = v_data_iso
      ORDER BY nome LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  -- So numeros: CPF, prontuario, numero de servico/pasta ou telefone.
  -- Antes cortava em (limite+offset)*3 linhas arbitrarias antes de ordenar.
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

  -- E-mail.
  -- Antes cortava em (limite+offset)*3 linhas arbitrarias antes de ordenar.
  IF v_termo LIKE '%@%' AND length(v_termo) >= 5 THEN
    RETURN QUERY
      SELECT * FROM public.pacientes
      WHERE clinica_id = _clinica_id AND ativo = true
        AND email ILIKE '%' || v_termo || '%'
      ORDER BY nome LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  -- Nome: cada palavra digitada vira um pedaco do padrao, sem acento e em
  -- maiusculas. Era aqui que o corte arbitrario mais doia -- antes cortava em
  -- (limite+offset)*4 linhas antes de ordenar.
  v_tokens := regexp_split_to_array(v_norm, '\s+');
  v_pattern := '%' || array_to_string(v_tokens, '%') || '%';

  RETURN QUERY
    SELECT * FROM public.pacientes
    WHERE clinica_id = _clinica_id AND ativo = true
      AND upper(public.strip_accents(nome)) LIKE v_pattern
    ORDER BY nome LIMIT v_limit OFFSET v_offset;
END;
$function$;

-- Reafirma as permissoes: a funcao le dados pessoais de paciente, entao segue
-- fechada para visitante anonimo e liberada apenas para usuario autenticado.
-- (CREATE OR REPLACE preserva as permissoes existentes; repetimos aqui para
-- garantir que uma reaplicacao desta migration nunca reabra a funcao ao anon.)
REVOKE EXECUTE ON FUNCTION public.buscar_pacientes(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_pacientes(uuid, text, integer, integer) TO authenticated;
