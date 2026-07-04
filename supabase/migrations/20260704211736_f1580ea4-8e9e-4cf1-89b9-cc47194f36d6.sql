
-- =========================================================
-- FASE 3: Conversão item-a-item de orçamentos mistos
-- =========================================================

-- ---------- 1. Procedimentos: classificação de destino ----------
ALTER TABLE public.procedimentos
  ADD COLUMN IF NOT EXISTS tipo_destino text,
  ADD COLUMN IF NOT EXISTS requer_medico boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requer_sala boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tipo_recurso text;

ALTER TABLE public.procedimentos
  DROP CONSTRAINT IF EXISTS procedimentos_tipo_destino_check;
ALTER TABLE public.procedimentos
  ADD CONSTRAINT procedimentos_tipo_destino_check
  CHECK (tipo_destino IS NULL OR tipo_destino IN (
    'consulta','exame_equipamento','laboratorio','procedimento_medico','venda_balcao'
  ));

-- Backfill heurístico best-effort (deixa NULL quando não reconhecido → obriga classificação manual)
UPDATE public.procedimentos SET
  tipo_destino = CASE
    WHEN nome ILIKE '%mapa%' OR nome ILIKE '%holter%' OR nome ILIKE '%ergometr%' OR nome ILIKE '%ecg%' OR nome ILIKE '%eletro%' THEN 'exame_equipamento'
    WHEN nome ILIKE '%ultrasso%' OR nome ILIKE '%us %' OR nome ILIKE 'us %' OR nome ILIKE '%doppler%' THEN 'exame_equipamento'
    WHEN nome ILIKE '%consulta%' OR nome ILIKE '%retorno%' OR nome ILIKE '%avalia%' THEN 'consulta'
    WHEN nome ILIKE '%laborat%' OR nome ILIKE '%coleta%' OR nome ILIKE '%hemograma%' OR nome ILIKE '%exame de sangue%' OR nome ILIKE '%urina%' THEN 'laboratorio'
    ELSE NULL
  END,
  requer_medico = CASE
    WHEN nome ILIKE '%consulta%' OR nome ILIKE '%retorno%' OR nome ILIKE '%ultrasso%' OR nome ILIKE '%doppler%' THEN true
    ELSE false
  END,
  requer_sala = CASE
    WHEN nome ILIKE '%mapa%' OR nome ILIKE '%holter%' OR nome ILIKE '%ultrasso%' OR nome ILIKE '%doppler%' OR nome ILIKE '%ergometr%' THEN true
    ELSE false
  END,
  tipo_recurso = CASE
    WHEN nome ILIKE '%mapa%' THEN 'mapa'
    WHEN nome ILIKE '%holter%' THEN 'holter'
    WHEN nome ILIKE '%ultrasso%' OR nome ILIKE '%doppler%' THEN 'us'
    WHEN nome ILIKE '%ergometr%' THEN 'ergometria'
    WHEN nome ILIKE '%ecg%' OR nome ILIKE '%eletro%' THEN 'ecg'
    WHEN nome ILIKE '%laborat%' OR nome ILIKE '%coleta%' THEN 'laboratorio'
    ELSE NULL
  END
WHERE tipo_destino IS NULL;

-- ---------- 2. Orcamento_itens: status por item ----------
ALTER TABLE public.orcamento_itens
  ADD COLUMN IF NOT EXISTS status_item text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fin_atendimento_id uuid REFERENCES public.fin_atendimentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_alterado_por uuid,
  ADD COLUMN IF NOT EXISTS status_alterado_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_nao_aplicavel text;

ALTER TABLE public.orcamento_itens
  DROP CONSTRAINT IF EXISTS orcamento_itens_status_item_check;
ALTER TABLE public.orcamento_itens
  ADD CONSTRAINT orcamento_itens_status_item_check
  CHECK (status_item IN ('pendente','agendado','vendido','nao_aplicavel','cancelado'));

CREATE UNIQUE INDEX IF NOT EXISTS orcamento_itens_agendamento_id_uk
  ON public.orcamento_itens(agendamento_id) WHERE agendamento_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orcamento_itens_fin_atendimento_id_uk
  ON public.orcamento_itens(fin_atendimento_id) WHERE fin_atendimento_id IS NOT NULL;

-- ---------- 3. Agendamentos: vínculo direto com item do orçamento ----------
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS orcamento_item_id uuid REFERENCES public.orcamento_itens(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agendamentos_orcamento_item_id_uk
  ON public.agendamentos(orcamento_item_id) WHERE orcamento_item_id IS NOT NULL;

-- ---------- 4. Fin_atendimentos: vínculo direto com item do orçamento ----------
ALTER TABLE public.fin_atendimentos
  ADD COLUMN IF NOT EXISTS orcamento_item_id uuid REFERENCES public.orcamento_itens(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fin_atendimentos_orcamento_item_id_uk
  ON public.fin_atendimentos(orcamento_item_id) WHERE orcamento_item_id IS NOT NULL;

-- ---------- 5. Orcamentos: normaliza status legado + relaxa constraint ----------
-- Não há CHECK no status, só normalização de dados
UPDATE public.orcamentos SET status = 'aberto' WHERE status = 'aprovado';

-- ---------- 6. Medico_agendas: tipo de recurso + sala + medico opcional ----------
ALTER TABLE public.medico_agendas
  ADD COLUMN IF NOT EXISTS tipo_recurso text,
  ADD COLUMN IF NOT EXISTS sala text;

ALTER TABLE public.medico_agendas
  ALTER COLUMN medico_id DROP NOT NULL;

-- ---------- 7. Trigger de recomputo do status do orçamento ----------
CREATE OR REPLACE FUNCTION public.fn_orcamento_recalcula_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orcamento_id uuid;
  v_total int;
  v_resolvidos int;
  v_com_dest int;
  v_cancelados int;
  v_novo_status text;
  v_status_atual text;
BEGIN
  v_orcamento_id := COALESCE(NEW.orcamento_id, OLD.orcamento_id);
  IF v_orcamento_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status_item IN ('agendado','vendido','nao_aplicavel','cancelado')),
    COUNT(*) FILTER (WHERE status_item IN ('agendado','vendido')),
    COUNT(*) FILTER (WHERE status_item = 'cancelado')
  INTO v_total, v_resolvidos, v_com_dest, v_cancelados
  FROM public.orcamento_itens
  WHERE orcamento_id = v_orcamento_id;

  IF v_total = 0 THEN RETURN COALESCE(NEW, OLD); END IF;

  IF v_cancelados = v_total THEN
    v_novo_status := 'cancelado';
  ELSIF v_resolvidos = v_total AND v_com_dest > 0 THEN
    v_novo_status := 'convertido';
  ELSIF v_com_dest > 0 THEN
    v_novo_status := 'parcialmente_agendado';
  ELSE
    v_novo_status := 'aberto';
  END IF;

  SELECT status INTO v_status_atual FROM public.orcamentos WHERE id = v_orcamento_id;
  IF v_status_atual IS DISTINCT FROM v_novo_status THEN
    -- usa UPDATE direto contornando o bloqueio de convertido (é o trigger que está setando)
    UPDATE public.orcamentos SET status = v_novo_status, updated_at = now()
    WHERE id = v_orcamento_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_orcamento_recalc_status ON public.orcamento_itens;
CREATE TRIGGER trg_orcamento_recalc_status
AFTER INSERT OR UPDATE OF status_item OR DELETE ON public.orcamento_itens
FOR EACH ROW EXECUTE FUNCTION public.fn_orcamento_recalcula_status();

-- ---------- 8. Trigger de validação de agendamento originado de orçamento ----------
CREATE OR REPLACE FUNCTION public.fn_agendamento_valida_destino()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo_destino text;
  v_tipo_recurso_proc text;
  v_requer_medico boolean;
  v_requer_sala boolean;
  v_tipo_recurso_agenda text;
BEGIN
  IF NEW.orcamento_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.tipo_destino, p.tipo_recurso, p.requer_medico, p.requer_sala
    INTO v_tipo_destino, v_tipo_recurso_proc, v_requer_medico, v_requer_sala
  FROM public.orcamento_itens oi
  LEFT JOIN public.procedimentos p ON p.id = oi.procedimento_id
  WHERE oi.id = NEW.orcamento_item_id;

  IF v_tipo_destino IS NULL THEN
    RAISE EXCEPTION 'Procedimento não classificado. Classifique o tipo de destino em Configurações → Procedimentos antes de agendar.';
  END IF;

  IF v_tipo_destino IN ('consulta','procedimento_medico') AND NEW.medico_id IS NULL THEN
    RAISE EXCEPTION 'Este procedimento (%) exige um médico.', v_tipo_destino;
  END IF;

  IF v_tipo_destino = 'exame_equipamento' AND NEW.enfermagem_recurso_id IS NULL AND NEW.agenda_id IS NULL THEN
    RAISE EXCEPTION 'Este exame exige uma agenda de equipamento ou recurso.';
  END IF;

  IF v_requer_sala AND NEW.enfermagem_recurso_id IS NULL AND NEW.agenda_id IS NULL THEN
    RAISE EXCEPTION 'Este procedimento exige sala/equipamento.';
  END IF;

  IF v_tipo_destino = 'exame_equipamento' AND NEW.agenda_id IS NOT NULL AND v_tipo_recurso_proc IS NOT NULL THEN
    SELECT tipo_recurso INTO v_tipo_recurso_agenda FROM public.medico_agendas WHERE id = NEW.agenda_id;
    IF v_tipo_recurso_agenda IS DISTINCT FROM v_tipo_recurso_proc THEN
      RAISE EXCEPTION 'Agenda incompatível: o procedimento requer recurso "%", mas a agenda escolhida é "%".',
        v_tipo_recurso_proc, COALESCE(v_tipo_recurso_agenda,'consulta');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_valida_destino ON public.agendamentos;
CREATE TRIGGER trg_agendamento_valida_destino
BEFORE INSERT ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_agendamento_valida_destino();

-- ---------- 9. Recompute status inicial dos orçamentos existentes ----------
-- Marca todos os itens de orçamentos já 'convertido' como 'vendido' (retrocompatível)
UPDATE public.orcamento_itens oi
SET status_item = 'vendido', status_alterado_em = now()
FROM public.orcamentos o
WHERE oi.orcamento_id = o.id AND o.status = 'convertido' AND oi.status_item = 'pendente';

-- ---------- 10. Grants (apenas colunas novas — tabelas já tinham grants) ----------
-- Nada novo a granular; ALTER TABLE preserva grants existentes.
