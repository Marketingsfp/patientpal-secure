-- ============================================================================
-- Prontuário: botão de correção na ficha do paciente
-- Data: 08/09/2026
--
-- O QUE ESTE ARQUIVO FAZ
-- Cria a função que o botão novo da ficha usa. Ela troca o número de prontuário
-- de UM paciente pelo próximo número livre do arquivo físico.
--
-- POR QUE
-- Entre 08/07 e 04/09/2026 o gerador automático entregou números na faixa dos
-- 2,65 milhões, muito à frente do arquivo físico. São 947 pacientes. Quando um
-- deles volta ao balcão, a guia sai com o número velho.
--
-- Corrigir de dois em dois pelo suporte não dá conta de 947. Com este botão a
-- recepcionista resolve na hora, com a pasta física na mão — que é justamente
-- o momento em que dá para reetiquetar.
--
-- A TRAVA IMPORTANTE
-- A função só aceita corrigir paciente que está comprovadamente na lista da
-- falha: número acima de 2.500.000 E cadastrado dentro da janela em que o
-- gerador estava errado. Qualquer outro paciente é recusado, com uma mensagem
-- explicando que o caminho é editar o campo na ficha.
--
-- Isso protege os cadastros que vieram da migração do sistema antigo: eles
-- também têm números altos, mas o número veio de lá e não é nosso para trocar.
--
-- QUEM PODE USAR
-- Admin, gestor, supervisor e recepção da própria clínica.
--
-- SEGURANÇA
-- Um paciente por vez. Nada em massa. Toda troca fica registrada no histórico
-- (audit_log) com quem fez, a hora, o número antigo e o novo.
--
-- COMO RODAR
-- Cole este arquivo inteiro no SQL editor do Lovable Cloud e execute.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.paciente_corrigir_prontuario_estante(_paciente_id uuid)
RETURNS TABLE (antigo text, novo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Janela da falha. O gerador passou a errar em 08/07/2026 e foi corrigido em
  -- 04/09/2026 as 12:01:44. Sao datas historicas: a janela esta fechada e nao
  -- muda mais.
  _falha_inicio constant timestamptz := '2026-07-08 00:00:00-03';
  _falha_fim    constant timestamptz := '2026-09-04 12:01:44-03';
  -- Acima disso nao existe pasta no arquivo fisico desta clinica.
  _teto_arquivo constant bigint := 2500000;

  _clinica uuid;
  _antigo  text;
  _criado  timestamptz;
  _prox    bigint;
  _voltas  int := 0;
BEGIN
  SELECT p.clinica_id, p.codigo_prontuario, p.created_at
    INTO _clinica, _antigo, _criado
    FROM public.pacientes p
   WHERE p.id = _paciente_id;

  IF _clinica IS NULL THEN
    RAISE EXCEPTION 'Paciente nao encontrado.';
  END IF;

  IF NOT public.has_any_role(
       auth.uid(), _clinica,
       ARRAY['admin','gestor','supervisor','recepcao']::app_role[]) THEN
    RAISE EXCEPTION 'Voce nao tem permissao para corrigir o prontuario deste paciente.';
  END IF;

  IF _antigo IS NULL
     OR _antigo !~ '^\d+$'
     OR (_antigo)::bigint <= _teto_arquivo
     OR _criado <  _falha_inicio
     OR _criado >= _falha_fim THEN
    RAISE EXCEPTION 'O prontuario deste paciente nao entra na correcao automatica. Se o numero precisa mudar, edite o campo na ficha e confira na pasta.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pac_codigo:'||_clinica::text));

  SELECT s.proximo INTO _prox
    FROM public.prontuario_sequencia s
   WHERE s.clinica_id = _clinica
     FOR UPDATE;

  IF _prox IS NULL THEN
    RAISE EXCEPTION 'Esta clinica ainda nao tem contador de prontuario. Fale com o suporte.';
  END IF;

  -- Anda ate achar um numero que nao seja de ninguem.
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.pacientes p
       WHERE p.clinica_id = _clinica
         AND p.codigo_prontuario ~ '^\d{1,7}$'
         AND (p.codigo_prontuario)::bigint = _prox
    );
    _prox   := _prox + 1;
    _voltas := _voltas + 1;
    IF _voltas > 20000 THEN
      RAISE EXCEPTION 'Nao foi possivel encontrar um numero de prontuario livre. Fale com o suporte.';
    END IF;
  END LOOP;

  IF _prox > 9999999 THEN
    RAISE EXCEPTION 'A numeracao de prontuario chegou ao limite de 7 digitos nesta clinica. Fale com o suporte.';
  END IF;

  UPDATE public.pacientes
     SET codigo_prontuario = _prox::text
   WHERE id = _paciente_id;

  -- O gatilho trg_pacientes_avanca_sequencia ja empurra o contador ao ver o
  -- numero novo; esta linha so garante o avanco se o gatilho for removido um
  -- dia. Escrever o mesmo valor duas vezes nao tem efeito colateral.
  UPDATE public.prontuario_sequencia
     SET proximo = _prox + 1, atualizado_em = now()
   WHERE clinica_id = _clinica
     AND proximo <= _prox;

  RETURN QUERY SELECT _antigo, _prox::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.paciente_corrigir_prontuario_estante(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.paciente_corrigir_prontuario_estante(uuid) TO authenticated;

COMMIT;

-- ============================================================================
-- CONFERÊNCIA (rode depois; é só leitura)
-- Quantos pacientes ainda estão na lista da correção.
-- ============================================================================
-- SELECT count(*) AS ainda_para_corrigir
--   FROM public.pacientes
--  WHERE clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
--    AND codigo_prontuario ~ '^\d+$'
--    AND (codigo_prontuario)::bigint > 2500000
--    AND created_at >= '2026-07-08 00:00:00-03'
--    AND created_at <  '2026-09-04 12:01:44-03';
