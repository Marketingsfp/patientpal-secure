-- ============================================================================
-- Prontuário: trava que impede dois pacientes com o mesmo número
-- Data: 03/09/2026
--
-- O QUE ESTE ARQUIVO FAZ
-- Cria uma conferência automática no banco. A partir de agora, se alguém tentar
-- salvar um paciente com um número de prontuário que já pertence a outra
-- pessoa, o sistema recusa e mostra o nome de quem já tem aquele número.
--
-- O QUE ELE NÃO FAZ
-- Não altera o número de nenhum paciente. Não apaga ninguém. Não mexe nos 49
-- números repetidos que já existem — esses continuam como estão até a recepção
-- auditar as fichas de papel. Editar nome, telefone ou endereço de um desses
-- cadastros continua funcionando normalmente.
--
-- POR QUE
-- A tabela de pacientes nunca teve trava de número único. Por causa disso, uma
-- importação feita em 20/07/2026 gravou 47 pacientes por cima de números que já
-- estavam em uso (mais 2 casos antigos, de maio/junho). Hoje são 49 números
-- repetidos, 98 pacientes envolvidos — e duas pastas físicas disputando o mesmo
-- lugar na estante em cada caso. Sem esta trava, a próxima importação repete o
-- problema em silêncio.
--
-- SEGURANÇA
-- Está tudo dentro de uma transação: se algo der errado no meio, nada é
-- aplicado. Nenhuma linha da tabela pacientes é lida para escrita.
--
-- COMO RODAR
-- Cole este arquivo inteiro no SQL editor do Lovable Cloud e execute.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.pacientes_valida_codigo_unico()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _dono text;
BEGIN
  -- Campo vazio não é conflito: nesse caso o gerador automático já preencheu
  -- com um número novo (trigger trg_pacientes_set_codigo_prontuario, que roda
  -- antes desta por ordem alfabética do nome do gatilho).
  IF NEW.codigo_prontuario IS NULL OR length(trim(NEW.codigo_prontuario)) = 0 THEN
    RETURN NEW;
  END IF;

  -- Numa edição, só confere quando o número realmente mudou. É isso que deixa a
  -- recepção continuar editando os 49 cadastros repetidos de hoje sem travar.
  IF TG_OP = 'UPDATE' AND NEW.codigo_prontuario IS NOT DISTINCT FROM OLD.codigo_prontuario THEN
    RETURN NEW;
  END IF;

  -- 1) Mesmo número escrito exatamente igual. Usa o índice
  --    idx_pacientes_clinica_cod_prontuario, então é instantâneo mesmo com
  --    252 mil pacientes.
  SELECT p.nome
    INTO _dono
    FROM public.pacientes p
   WHERE p.clinica_id = NEW.clinica_id
     AND p.codigo_prontuario = NEW.codigo_prontuario
     AND p.id <> NEW.id
   LIMIT 1;

  -- 2) Mesmo número escrito com zeros à esquerda diferentes ("5" e "00005").
  --    O texto da condição repete o do índice idx_pacientes_clinica_codigo_num7
  --    de propósito: é assim que o Postgres consegue usar o índice.
  IF _dono IS NULL AND NEW.codigo_prontuario ~ '^\d{1,7}$' THEN
    SELECT p.nome
      INTO _dono
      FROM public.pacientes p
     WHERE p.clinica_id = NEW.clinica_id
       AND p.codigo_prontuario ~ '^\d{1,7}$'
       AND (p.codigo_prontuario)::bigint = (NEW.codigo_prontuario)::bigint
       AND p.id <> NEW.id
     LIMIT 1;
  END IF;

  IF _dono IS NOT NULL THEN
    -- RAISE sem ERRCODE gera o código P0001, que o sistema já sabe mostrar como
    -- mensagem em português na tela. O nome é cortado em 60 letras para o aviso
    -- não passar do tamanho que a tela exibe por extenso.
    RAISE EXCEPTION 'O prontuário % já é de %. Cada paciente tem um número só: confira a ficha, ou deixe o campo em branco para o sistema gerar o próximo número livre.',
      NEW.codigo_prontuario, left(_dono, 60);
  END IF;

  RETURN NEW;
END;
$function$;

-- O nome começa com "trg_pacientes_v" de propósito: gatilhos BEFORE rodam em
-- ordem alfabética, e este precisa rodar DEPOIS do gerador automático
-- (trg_pacientes_set_codigo_prontuario), para conferir o número já preenchido.
DROP TRIGGER IF EXISTS trg_pacientes_valida_codigo_unico ON public.pacientes;
CREATE TRIGGER trg_pacientes_valida_codigo_unico
  BEFORE INSERT OR UPDATE OF codigo_prontuario ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.pacientes_valida_codigo_unico();

COMMIT;
