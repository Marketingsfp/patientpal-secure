-- ============================================================================
-- Prontuário: funções da tela "Numeração de Prontuário"
-- Data: 04/09/2026
--
-- O QUE ESTE ARQUIVO FAZ
-- Cria as duas funções que a tela nova usa para ler e ajustar o contador da
-- estante. Não altera o número de nenhum paciente e não muda o gerador.
--
-- POR QUE
-- O contador (prontuario_sequencia) mora numa tabela trancada: nenhum usuário
-- do sistema consegue ler ou gravar nela direto, de propósito. Para a recepção
-- poder ajustar o número pela tela, ela precisa passar por estas duas funções,
-- que conferem a permissão antes de deixar mexer.
--
-- Isso é necessário porque o sistema antigo continua numerando em paralelo. A
-- estante anda lá sem o sistema novo ficar sabendo, e sem esta tela cada
-- divergência vira um chamado de suporte.
--
-- QUEM PODE USAR
-- Admin, gestor, supervisor e recepção da própria clínica. Qualquer outro
-- perfil recebe uma recusa.
--
-- SEGURANÇA
-- Toda alteração fica registrada no histórico (audit_log), com quem mexeu, a
-- hora, o valor antigo e o novo. Está tudo dentro de uma transação.
--
-- COMO RODAR
-- Cole este arquivo inteiro no SQL editor do Lovable Cloud e execute.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Histórico: toda mudança no contador fica registrada.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_prontuario_sequencia ON public.prontuario_sequencia;
CREATE TRIGGER trg_audit_prontuario_sequencia
  AFTER INSERT OR UPDATE OR DELETE ON public.prontuario_sequencia
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- ----------------------------------------------------------------------------
-- 2) Ler: em que número o contador está.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prontuario_sequencia_ver(_clinica_id uuid)
RETURNS TABLE (proximo bigint, atualizado_em timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(
       auth.uid(), _clinica_id,
       ARRAY['admin','gestor','supervisor','recepcao']::app_role[]) THEN
    RAISE EXCEPTION 'Voce nao tem permissao para ver a numeracao de prontuario desta clinica.';
  END IF;

  RETURN QUERY
  SELECT s.proximo, s.atualizado_em
    FROM public.prontuario_sequencia s
   WHERE s.clinica_id = _clinica_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 3) Ajustar: a recepção informa a última pasta usada na estante.
--    O contador passa a apontar para o próximo número LIVRE depois dela.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prontuario_sequencia_ajustar(
  _clinica_id uuid,
  _ultima_pasta bigint
)
RETURNS TABLE (proximo bigint, pulados int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _prox   bigint;
  _pulados int := 0;
  _voltas  int := 0;
BEGIN
  IF NOT public.has_any_role(
       auth.uid(), _clinica_id,
       ARRAY['admin','gestor','supervisor','recepcao']::app_role[]) THEN
    RAISE EXCEPTION 'Voce nao tem permissao para ajustar a numeracao de prontuario desta clinica.';
  END IF;

  IF _ultima_pasta IS NULL OR _ultima_pasta < 1 OR _ultima_pasta > 9999998 THEN
    RAISE EXCEPTION 'Informe o numero da ultima pasta usada na estante, entre 1 e 9999998.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pac_codigo:'||_clinica_id::text));

  -- Anda até achar um número que não seja de nenhum paciente. Se a pasta
  -- seguinte já estiver ocupada no sistema, ele pula — e a tela avisa quantos.
  _prox := _ultima_pasta + 1;
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.pacientes p
       WHERE p.clinica_id = _clinica_id
         AND p.codigo_prontuario ~ '^\d{1,7}$'
         AND (p.codigo_prontuario)::bigint = _prox
    );
    _prox    := _prox + 1;
    _pulados := _pulados + 1;
    _voltas  := _voltas + 1;
    IF _voltas > 20000 THEN
      RAISE EXCEPTION 'Nao foi possivel encontrar um numero livre a partir de %. Fale com o suporte.', _ultima_pasta + 1;
    END IF;
  END LOOP;

  IF _prox > 9999999 THEN
    RAISE EXCEPTION 'A numeracao de prontuario chegou ao limite de 7 digitos nesta clinica. Fale com o suporte.';
  END IF;

  INSERT INTO public.prontuario_sequencia AS s (clinica_id, proximo)
  VALUES (_clinica_id, _prox)
  ON CONFLICT (clinica_id)
  DO UPDATE SET proximo = EXCLUDED.proximo, atualizado_em = now();

  RETURN QUERY SELECT _prox, _pulados;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4) Quem pode chamar. A conferência de perfil está dentro das funções; aqui
--    só liberamos o acesso para usuário logado e barramos o visitante.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.prontuario_sequencia_ver(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.prontuario_sequencia_ajustar(uuid, bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.prontuario_sequencia_ver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prontuario_sequencia_ajustar(uuid, bigint) TO authenticated;

COMMIT;

-- ============================================================================
-- CONFERÊNCIA (rode depois; é só leitura)
-- ============================================================================
-- SELECT * FROM public.prontuario_sequencia_ver('7570ddde-8c1c-4b55-ba72-cf12b2a6c940');
