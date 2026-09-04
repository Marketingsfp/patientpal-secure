-- ============================================================================
-- Prontuário: a numeração automática volta a seguir o arquivo físico
-- Data: 04/09/2026
--
-- O QUE ESTE ARQUIVO FAZ
-- Muda a forma como o sistema escolhe o número de um paciente novo quando a
-- recepção deixa o campo em branco. Ele NÃO altera o número de nenhum paciente
-- já cadastrado.
--
-- POR QUE
-- Hoje o número novo é "o maior número que existe na clínica + 1". O problema é
-- que a importação do sistema antigo trouxe cadastros numerados até 2.656.939,
-- que não fazem parte da sequência que a recepção usa na estante.
--
-- A sequência de verdade, a que a recepção lê na ficha de papel e digita todo
-- dia, está hoje em 2.438.681 e anda algumas dezenas por dia:
--   18/08 -> 2.437.437   31/08 -> 2.438.518   03/09 -> 2.438.667
--   19/08 -> 2.438.121   01/09 -> 2.438.600   04/09 -> 2.438.681
--
-- Resultado: todo paciente cadastrado sem número recebia algo perto de
-- 2.656.940 — cerca de 218 mil números à frente da estante. Desde 08/07/2026
-- isso aconteceu 961 vezes, e é por isso que a recepção vem corrigindo cadastro
-- por cadastro.
--
-- COMO FICA
-- O sistema passa a guardar um contador próprio, apontando para o próximo
-- número livre do arquivo físico. Duas regras:
--   1) Cadastro sem número: pega o contador e, se aquele número já pertencer a
--      alguém, anda para o próximo livre.
--   2) Cadastro com número digitado: o número digitado manda, como sempre. Se
--      ele estiver logo à frente do contador (até 5.000 à frente), o contador
--      avança junto — assim o sistema acompanha sozinho o ritmo da estante.
--      Um número muito acima disso (uma digitação errada como 2.656.813 ou
--      24378101) é aceito naquele cadastro, mas NÃO arrasta mais a numeração.
--
-- SEGURANÇA
-- Nenhum paciente é alterado. Nenhum dado é apagado. Está tudo dentro de uma
-- transação: se algo der errado no meio, nada é aplicado.
--
-- DEPOIS DE RODAR
-- O próximo paciente cadastrado sem número receberá 2438682.
--
-- COMO RODAR
-- Cole este arquivo inteiro no SQL editor do Lovable Cloud e execute.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) O contador. Uma linha por clínica.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prontuario_sequencia (
  clinica_id    uuid PRIMARY KEY REFERENCES public.clinicas(id) ON DELETE CASCADE,
  proximo       bigint NOT NULL CHECK (proximo > 0),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.prontuario_sequencia IS
  'Proximo numero de prontuario livre do arquivo fisico, por clinica. So as funcoes de numeracao escrevem aqui; o aplicativo nao le nem grava esta tabela.';

-- Ninguém acessa esta tabela pelo aplicativo: RLS ligada e sem nenhuma policy.
-- As funções abaixo são SECURITY DEFINER e por isso enxergam a tabela.
ALTER TABLE public.prontuario_sequencia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prontuario_sequencia FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) A semente: onde a estante está hoje.
--    2438681 é o maior número que a recepção digitou da ficha de papel nos
--    últimos 45 dias. O próximo livre, portanto, é 2438682.
-- ----------------------------------------------------------------------------
INSERT INTO public.prontuario_sequencia (clinica_id, proximo)
VALUES ('7570ddde-8c1c-4b55-ba72-cf12b2a6c940', 2438682)
ON CONFLICT (clinica_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3) Gerador do número de um cadastro novo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pacientes_set_codigo_prontuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _prox   bigint;
  _voltas int := 0;
  _txt    text;
BEGIN
  -- Número digitado pela recepção manda: é o que está na ficha de papel.
  IF NEW.codigo_prontuario IS NOT NULL AND length(trim(NEW.codigo_prontuario)) > 0 THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pac_codigo:'||NEW.clinica_id::text));

  SELECT proximo INTO _prox
    FROM public.prontuario_sequencia
   WHERE clinica_id = NEW.clinica_id
     FOR UPDATE;

  -- Clínica que ainda não tem contador: começa do maior número dela + 1. Só
  -- acontece uma vez, no primeiro cadastro depois desta correção.
  IF _prox IS NULL THEN
    SELECT COALESCE(MAX((codigo_prontuario)::bigint), 0) + 1
      INTO _prox
      FROM public.pacientes
     WHERE clinica_id = NEW.clinica_id
       AND codigo_prontuario ~ '^\d{1,7}$';
    INSERT INTO public.prontuario_sequencia (clinica_id, proximo)
    VALUES (NEW.clinica_id, _prox);
  END IF;

  -- Anda até achar um número que não seja de ninguém. Na faixa em uso hoje,
  -- 945 de cada 1.000 números estão livres, então quase sempre é de primeira.
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.pacientes p
       WHERE p.clinica_id = NEW.clinica_id
         AND p.codigo_prontuario ~ '^\d{1,7}$'
         AND (p.codigo_prontuario)::bigint = _prox
    );
    _prox   := _prox + 1;
    _voltas := _voltas + 1;
    IF _voltas > 20000 THEN
      RAISE EXCEPTION 'Nao foi possivel encontrar um numero de prontuario livre a partir de %. Fale com o suporte.', _prox;
    END IF;
  END LOOP;

  -- Trava de fim de régua: preferimos recusar o cadastro, com mensagem clara, a
  -- voltar a gerar números de 8 dígitos sem ninguém notar.
  IF _prox > 9999999 THEN
    RAISE EXCEPTION 'A numeracao de prontuario chegou ao limite de 7 digitos nesta clinica. Fale com o suporte antes de cadastrar novos pacientes.';
  END IF;

  UPDATE public.prontuario_sequencia
     SET proximo = _prox + 1, atualizado_em = now()
   WHERE clinica_id = NEW.clinica_id;

  _txt := _prox::text;
  IF length(_txt) < 5 THEN
    _txt := lpad(_txt, 5, '0');
  END IF;
  NEW.codigo_prontuario := _txt;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4) O contador acompanha o que a recepção digita da ficha de papel.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pacientes_avanca_sequencia_prontuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Distância máxima que o contador aceita pular de uma vez. O maior salto real
  -- observado num dia de trabalho foi 684. 5.000 dá folga de meses e ainda
  -- barra uma digitação errada muito acima da faixa.
  _janela constant bigint := 5000;
  _num bigint;
BEGIN
  IF NEW.codigo_prontuario IS NULL OR NEW.codigo_prontuario !~ '^\d{1,7}$' THEN
    RETURN NULL;
  END IF;

  _num := (NEW.codigo_prontuario)::bigint;

  PERFORM pg_advisory_xact_lock(hashtext('pac_codigo:'||NEW.clinica_id::text));

  UPDATE public.prontuario_sequencia
     SET proximo = _num + 1, atualizado_em = now()
   WHERE clinica_id = NEW.clinica_id
     AND proximo <= _num
     AND proximo > _num - _janela;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pacientes_avanca_sequencia ON public.pacientes;
CREATE TRIGGER trg_pacientes_avanca_sequencia
  AFTER INSERT OR UPDATE OF codigo_prontuario ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.pacientes_avanca_sequencia_prontuario();

COMMIT;

-- ============================================================================
-- CONFERÊNCIA (rode depois; é só leitura)
-- Deve mostrar proximo = 2438682.
-- ============================================================================
-- SELECT clinica_id, proximo, atualizado_em FROM public.prontuario_sequencia;
