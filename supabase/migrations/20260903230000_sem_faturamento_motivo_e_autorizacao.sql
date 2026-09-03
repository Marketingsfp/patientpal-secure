-- ============================================================================
-- SEM FATURAMENTO: MOTIVO OBRIGATÓRIO E AUTORIZAÇÃO DA SUPERVISÃO
-- ============================================================================
-- A marcação "sem faturamento" (criada em 20260903210000) apaga uma receita da
-- clínica com um clique: o atendimento acontece e nada é cobrado. Ela nasceu
-- sem alçada e sem justificativa — qualquer pessoa com acesso de escrita na
-- agenda podia marcar, e ninguém sabia depois por que aquele atendimento não
-- entrou no caixa.
--
-- O que esta migração acrescenta:
--   1. As colunas do motivo e de quem autorizou (separado de quem operou a
--      tela: no balcão são duas pessoas diferentes).
--   2. Uma trava que recusa MARCAR sem motivo escrito.
--   3. Uma trava que recusa marcar ou desmarcar quando quem está operando não
--      tem alçada (admin, gestor ou supervisor) e ninguém com alçada autorizou.
--
-- Não mexe em dado existente: as três marcações já feitas continuam válidas e
-- sem motivo — a exigência vale para marcações NOVAS. Corrigir o passado
-- levantaria a suspeita sobre atendimentos que ninguém lembra mais.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Colunas do motivo e da autorização
-- ---------------------------------------------------------------------------
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS sem_faturamento_motivo text,
  ADD COLUMN IF NOT EXISTS sem_faturamento_autorizado_por uuid,
  ADD COLUMN IF NOT EXISTS sem_faturamento_autorizado_por_nome text;

COMMENT ON COLUMN public.agendamentos.sem_faturamento_motivo IS
  'Por que este atendimento não é cobrado (ex.: exame de parceiro/Detran, acordo da diretoria). Obrigatório ao marcar. NULL quando não está marcado.';
COMMENT ON COLUMN public.agendamentos.sem_faturamento_autorizado_por IS
  'Usuário com alçada (admin, gestor ou supervisor) que autorizou a ÚLTIMA mudança desta marcação — marcar ou remover. Pode ser diferente de sem_faturamento_por, que é quem operou a tela. Fica preenchido mesmo depois da remoção, porque é ele que prova a alçada da remoção.';
COMMENT ON COLUMN public.agendamentos.sem_faturamento_autorizado_por_nome IS
  'Nome de quem autorizou, gravado na linha para a agenda não precisar consultar profiles em cada atendimento listado.';

-- ---------------------------------------------------------------------------
-- 2 e 3. Trava de motivo e de alçada
-- ---------------------------------------------------------------------------
-- Vale para INSERT (agendamento já criado marcado) e para UPDATE, e só age
-- quando a marcação MUDA — reagendar, dar baixa ou editar a observação de um
-- atendimento já marcado não passa por aqui.
--
-- CONTEXTO DE SERVIÇO: quando `auth.uid()` é NULL, quem está gravando não é
-- uma pessoa logada, e sim uma rotina do próprio sistema (importação, edge
-- function, correção rodada no SQL editor). Bloquear esse caso derrubaria
-- rotinas que não têm como "ser supervisor", então a trava se aplica apenas a
-- gravações feitas por um usuário logado — que é exatamente por onde a
-- recepção passa.
CREATE OR REPLACE FUNCTION public.fn_sem_faturamento_exige_motivo_e_alcada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- OLD não existe em INSERT: lê-lo no DECLARE derrubaria todo cadastro novo
  -- de agendamento com "record old is not assigned yet".
  v_antes boolean;
  v_depois boolean := COALESCE(NEW.sem_faturamento, false);
  v_uid uuid := auth.uid();
  v_tem_alcada boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_antes := false;
  ELSE
    v_antes := COALESCE(OLD.sem_faturamento, false);
  END IF;

  -- A marcação não mudou: nada a validar.
  IF v_antes IS NOT DISTINCT FROM v_depois THEN
    RETURN NEW;
  END IF;

  IF v_depois AND COALESCE(LENGTH(BTRIM(NEW.sem_faturamento_motivo)), 0) < 4 THEN
    RAISE EXCEPTION
      'Para marcar um atendimento como SEM FATURAMENTO é obrigatório informar o motivo da isenção.';
  END IF;

  -- Rotina do sistema, sem usuário logado: segue.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_tem_alcada := public.has_any_role(
    _user_id => v_uid,
    _clinica_id => NEW.clinica_id,
    _roles => ARRAY['admin', 'gestor', 'supervisor']::public.app_role[]
  );

  -- Quem não tem alçada só passa se um supervisor tiver autorizado na hora —
  -- é o caminho da recepcionista que pediu a senha na tela. O autorizador é
  -- conferido de novo aqui: sem isso bastaria mandar um nome qualquer no
  -- campo para furar a trava.
  IF NOT v_tem_alcada THEN
    IF NEW.sem_faturamento_autorizado_por IS NULL
       OR NOT public.has_any_role(
            _user_id => NEW.sem_faturamento_autorizado_por,
            _clinica_id => NEW.clinica_id,
            _roles => ARRAY['admin', 'gestor', 'supervisor']::public.app_role[]
          )
    THEN
      RAISE EXCEPTION
        'Marcar ou remover SEM FATURAMENTO é uma ação restrita à supervisão (administrador, gestor ou supervisor). Peça a autorização na tela da Agenda.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sem_faturamento_exige_motivo_e_alcada ON public.agendamentos;
CREATE TRIGGER trg_sem_faturamento_exige_motivo_e_alcada
  BEFORE INSERT OR UPDATE OF sem_faturamento
  ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sem_faturamento_exige_motivo_e_alcada();

COMMIT;
