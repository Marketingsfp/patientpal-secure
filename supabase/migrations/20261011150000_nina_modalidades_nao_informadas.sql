-- Transicao temporaria do agendamento da Nina.
-- Escopo: somente os catalogos nina_cat_servicos e nina_cat_profissionais.
-- Efeito: todas as modalidades atuais, inclusive ordem de chegada, passam a
-- "Nao informado" nos campos publicados e nos rascunhos.
-- Auditoria: as duas tabelas ja possuem fn_audit_trigger; a migracao aborta
-- antes de alterar dados se esses gatilhos nao estiverem ativos.
-- Rollback: restaurar os valores anteriores registrados em audit_log para esta
-- execucao, com conferencia por id e updated_at. Nunca apagar a auditoria.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $auditoria$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.nina_cat_servicos'::regclass
      AND tgname = 'trg_audit_nina_cat_servicos'
      AND NOT tgisinternal
      AND tgenabled <> 'D'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.nina_cat_profissionais'::regclass
      AND tgname = 'trg_audit_nina_cat_profissionais'
      AND NOT tgisinternal
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'Auditoria do catalogo da Nina nao esta ativa; nenhuma modalidade foi alterada.';
  END IF;
END
$auditoria$;

-- Remove somente o campo operacional de modalidade. Todos os demais
-- complementos (idade, criterio, preco, chegada e acrescimos) sao preservados.
CREATE OR REPLACE FUNCTION pg_temp.nina_limpar_modalidade_estrutura(valor jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $funcao$
DECLARE
  complementos jsonb;
BEGIN
  IF valor IS NULL OR jsonb_typeof(valor) <> 'object' THEN
    RETURN valor;
  END IF;

  IF jsonb_typeof(valor->'complementos') <> 'array' THEN
    RETURN valor;
  END IF;

  SELECT coalesce(jsonb_agg(item - 'modalidade' ORDER BY ordem), '[]'::jsonb)
    INTO complementos
    FROM jsonb_array_elements(valor->'complementos') WITH ORDINALITY AS itens(item, ordem);

  RETURN jsonb_set(valor, '{complementos}', complementos, true);
END
$funcao$;

-- Textos importados antigos podem conter uma linha usada apenas como
-- modalidade. Troca somente a linha inteira; observacoes compostas permanecem.
CREATE OR REPLACE FUNCTION pg_temp.nina_limpar_modalidade_texto(valor text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $funcao$
DECLARE
  linha text;
  resultado text := '';
  primeira boolean := true;
BEGIN
  IF valor IS NULL THEN
    RETURN NULL;
  END IF;

  FOR linha IN
    SELECT parte
      FROM regexp_split_to_table(valor, E'\\r?\\n') WITH ORDINALITY AS linhas(parte, ordem)
      ORDER BY ordem
  LOOP
    IF linha ~* '^[[:space:]]*(Observa[cç][aã]o|Modalidade([[:space:]]+de[[:space:]]+atendimento)?)[[:space:]]*:[[:space:]]*(Agendad[oa]|Por[[:space:]]+agendamento|Hor([aá]rio|a)[[:space:]]+marcad[oa]|Ordem[[:space:]]+de[[:space:]]+chegada([[:space:]]+(com|sem)[[:space:]]+(pr[eé][[:space:]-]*)?agendamento)?|Por[[:space:]]+(numera[cç][aã]o[[:space:]]+)?ficha|Ficha)[[:space:]]*$' THEN
      linha := regexp_replace(linha, ':[^:]*$', ': Não informado');
    END IF;

    resultado := resultado || CASE WHEN primeira THEN '' ELSE E'\n' END || linha;
    primeira := false;
  END LOOP;

  RETURN resultado;
END
$funcao$;

CREATE OR REPLACE FUNCTION pg_temp.nina_limpar_modalidade_rascunho(
  valor jsonb,
  campo_texto text,
  limpar_tipo_atendimento boolean
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $funcao$
DECLARE
  resultado jsonb := valor;
BEGIN
  IF valor IS NULL OR jsonb_typeof(valor) <> 'object' THEN
    RETURN valor;
  END IF;

  IF limpar_tipo_atendimento THEN
    resultado := jsonb_set(resultado, '{tipo_atendimento}', 'null'::jsonb, true);
  END IF;

  IF resultado ? 'estrutura' THEN
    resultado := jsonb_set(
      resultado,
      '{estrutura}',
      coalesce(pg_temp.nina_limpar_modalidade_estrutura(resultado->'estrutura'), 'null'::jsonb),
      true
    );
  END IF;

  IF resultado ? campo_texto AND jsonb_typeof(resultado->campo_texto) = 'string' THEN
    resultado := jsonb_set(
      resultado,
      ARRAY[campo_texto],
      to_jsonb(pg_temp.nina_limpar_modalidade_texto(resultado->>campo_texto)),
      true
    );
  END IF;

  RETURN resultado;
END
$funcao$;

UPDATE public.nina_cat_servicos
SET
  estrutura = pg_temp.nina_limpar_modalidade_estrutura(estrutura),
  descricao_publica = pg_temp.nina_limpar_modalidade_texto(descricao_publica),
  rascunho = pg_temp.nina_limpar_modalidade_rascunho(
    rascunho,
    'descricao_publica',
    false
  )
WHERE
  estrutura IS DISTINCT FROM pg_temp.nina_limpar_modalidade_estrutura(estrutura)
  OR descricao_publica IS DISTINCT FROM pg_temp.nina_limpar_modalidade_texto(descricao_publica)
  OR rascunho IS DISTINCT FROM pg_temp.nina_limpar_modalidade_rascunho(
    rascunho,
    'descricao_publica',
    false
  );

UPDATE public.nina_cat_profissionais
SET
  tipo_atendimento = NULL,
  estrutura = pg_temp.nina_limpar_modalidade_estrutura(estrutura),
  observacao_publica = pg_temp.nina_limpar_modalidade_texto(observacao_publica),
  rascunho = pg_temp.nina_limpar_modalidade_rascunho(
    rascunho,
    'observacao_publica',
    true
  )
WHERE
  tipo_atendimento IS NOT NULL
  OR estrutura IS DISTINCT FROM pg_temp.nina_limpar_modalidade_estrutura(estrutura)
  OR observacao_publica IS DISTINCT FROM pg_temp.nina_limpar_modalidade_texto(observacao_publica)
  OR rascunho IS DISTINCT FROM pg_temp.nina_limpar_modalidade_rascunho(
    rascunho,
    'observacao_publica',
    true
  );

COMMIT;
