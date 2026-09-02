-- ============================================================================
-- Prontuário: numeração automática volta para a régua de 7 dígitos
-- Data: 02/09/2026
--
-- O QUE ESTE ARQUIVO FAZ
-- Corrige o gerador do número de prontuário. Ele NÃO altera o número de
-- nenhum paciente já cadastrado. Só muda como o próximo número é calculado.
--
-- POR QUE
-- O número de um paciente novo é "maior número da clínica + 1". Em 19/08/2026,
-- às 12:57, alguém digitou 24378101 no cadastro de um paciente — é o
-- prontuário 2437810 de outra paciente com um dígito a mais. O último número
-- normal, 15 minutos antes, era 2656813. A partir daquele momento o gerador
-- passou a somar 1 em cima do número errado, e os 415 cadastros seguintes
-- nasceram com 8 dígitos.
--
-- A correção é ensinar o gerador a só olhar para números dentro da régua do
-- sistema antigo (até 7 dígitos). Assim, um erro de digitação como esse não
-- arrasta mais a numeração inteira: fica só naquele cadastro.
--
-- SEGURANÇA
-- Nenhum paciente é alterado. Nenhum dado é apagado. Se algo der errado no
-- meio, nada é aplicado (está tudo dentro de uma transação).
--
-- DEPOIS DE RODAR
-- O próximo paciente cadastrado receberá o número 2656814.
-- ============================================================================

BEGIN;

-- 1) Índice que faz o gerador achar o maior número sem varrer os 252 mil
--    pacientes. O texto da condição é igual ao da consulta abaixo de
--    propósito: é assim que o Postgres consegue usar o índice.
CREATE INDEX IF NOT EXISTS idx_pacientes_clinica_codigo_num7
  ON public.pacientes (clinica_id, ((codigo_prontuario)::bigint) DESC)
  WHERE codigo_prontuario ~ '^\d{1,7}$';

-- 2) O gerador em si.
CREATE OR REPLACE FUNCTION public.pacientes_set_codigo_prontuario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _next bigint;
  _txt  text;
BEGIN
  -- Número digitado pela recepção manda: é o que está na ficha de papel.
  IF NEW.codigo_prontuario IS NOT NULL AND length(trim(NEW.codigo_prontuario)) > 0 THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pac_codigo:'||NEW.clinica_id::text));

  -- '^\d{1,7}$' é a correção: só considera números dentro da régua do sistema
  -- antigo. Antes era '^\d+$', e por isso um 24378101 digitado por engano
  -- virava a base de toda a numeração seguinte.
  SELECT (codigo_prontuario)::bigint
    INTO _next
    FROM public.pacientes
   WHERE clinica_id = NEW.clinica_id
     AND codigo_prontuario ~ '^\d{1,7}$'
   ORDER BY (codigo_prontuario)::bigint DESC
   LIMIT 1;

  _next := COALESCE(_next, 0) + 1;

  -- Trava de fim de régua. Preferimos recusar o cadastro, com uma mensagem
  -- clara, a começar a gerar números de 8 dígitos de novo sem ninguém notar.
  IF _next > 9999999 THEN
    RAISE EXCEPTION 'A numeração de prontuário chegou ao limite de 7 dígitos nesta clínica. Fale com o suporte antes de cadastrar novos pacientes.';
  END IF;

  _txt := _next::text;
  IF length(_txt) < 5 THEN
    _txt := lpad(_txt, 5, '0');
  END IF;
  NEW.codigo_prontuario := _txt;
  RETURN NEW;
END;
$function$;

COMMIT;

-- ============================================================================
-- CONFERÊNCIA (rode depois; é só leitura)
-- Deve mostrar 2656813 como maior número na régua e 2656814 como o próximo.
-- ============================================================================
-- SELECT MAX(codigo_prontuario::bigint) AS maior_na_regua,
--        MAX(codigo_prontuario::bigint) + 1 AS proximo_numero
--   FROM public.pacientes
--  WHERE clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
--    AND codigo_prontuario ~ '^\d{1,7}$';
