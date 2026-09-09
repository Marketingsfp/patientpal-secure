-- ============================================================================
-- Prontuário: o botão de correção volta a funcionar para toda a equipe
-- Data: 09/09/2026
--
-- O QUE ESTE ARQUIVO FAZ
-- Muda UMA linha da função do botão "Corrigir para o próximo número da
-- estante": a regra de quem pode usar o botão.
--
-- POR QUE
-- A função exigia perfil admin, gestor, supervisor ou recepção. Mas quem fica
-- no balcão com a pasta na mão nem sempre tem esse perfil: NICOLE e MAYARA,
-- que são justamente as que mais corrigem prontuário à mão, estão cadastradas
-- como "caixa". Nesta clínica há 6 pessoas em caixa, 2 no financeiro, 1 em
-- enfermagem e 1 na telefonia na mesma situação.
--
-- Elas VIAM o botão (a tela libera pelo módulo Clientes, não pelo perfil) e ao
-- clicar recebiam "Você não tem permissão para corrigir o prontuário deste
-- paciente". Foi esse o erro relatado em 09/09/2026.
--
-- NÃO SE PERDE SEGURANÇA
-- Essas mesmas pessoas já podem apagar o número e digitar outro à mão no campo
-- da ficha — a regra do banco para editar paciente é apenas "ser da clínica"
-- (política pacientes_staff_update, que usa is_member). O botão era, portanto,
-- mais fechado do que a digitação manual que ele substitui, sem proteger nada.
-- Passa a valer a mesma régua: membro ativo da clínica.
--
-- O QUE CONTINUA IGUAL
-- Tudo o mais da função: só corrige paciente comprovadamente da falha (número
-- acima de 2.500.000 E cadastrado entre 08/07 e 04/09/2026), um por vez, nunca
-- em massa, e toda troca continua registrada no histórico com quem fez.
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

  -- Mesma regra da politica pacientes_staff_update: quem ja pode digitar o
  -- numero a mao na ficha pode pedir o proximo numero livre pelo botao.
  IF NOT public.is_member(auth.uid(), _clinica) THEN
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
-- CONFERENCIA (rode depois; e so leitura)
-- Deve mostrar "is_member" e NAO "has_any_role".
-- ============================================================================
-- SELECT CASE WHEN prosrc LIKE '%is_member%' THEN 'liberado para a equipe'
--             ELSE 'ainda restrito' END AS situacao
--   FROM pg_proc WHERE proname = 'paciente_corrigir_prontuario_estante';
