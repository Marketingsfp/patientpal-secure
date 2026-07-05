
-- =========================================================================
-- MIGRAÇÃO B — Fase 3.b
-- Separação: status_operacional | status_financeiro | status do orçamento
-- Arquitetura config-first; preparada para KPIs de tempo entre eventos.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1) orcamento_itens: novos campos + timestamps de transição
-- -------------------------------------------------------------------------
ALTER TABLE public.orcamento_itens
  ADD COLUMN IF NOT EXISTS status_operacional text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS status_financeiro  text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS pago_em            timestamptz,
  ADD COLUMN IF NOT EXISTS agendado_em        timestamptz,
  ADD COLUMN IF NOT EXISTS concluido_em       timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_em       timestamptz,
  ADD COLUMN IF NOT EXISTS status_op_em       timestamptz,
  ADD COLUMN IF NOT EXISTS status_fin_em      timestamptz;

-- Backfill: status_operacional herda status_item (Fase 3.a)
UPDATE public.orcamento_itens
   SET status_operacional = CASE
        WHEN status_item IN ('pendente','agendado','cancelado','nao_aplicavel') THEN status_item
        WHEN status_item = 'vendido' THEN 'agendado'   -- venda antiga: item já resolvido operacionalmente
        ELSE 'pendente'
      END,
       status_financeiro = CASE
        WHEN status_item = 'vendido' THEN 'pago'
        WHEN status_item = 'nao_aplicavel' THEN 'nao_aplicavel'
        WHEN status_item = 'cancelado' THEN 'pendente'
        ELSE 'pendente'
      END
 WHERE status_operacional = 'pendente' AND status_financeiro = 'pendente';

-- Constraints de domínio (permitem toda a lista da diretriz)
ALTER TABLE public.orcamento_itens
  DROP CONSTRAINT IF EXISTS orcamento_itens_status_op_chk,
  DROP CONSTRAINT IF EXISTS orcamento_itens_status_fin_chk;

ALTER TABLE public.orcamento_itens
  ADD CONSTRAINT orcamento_itens_status_op_chk
    CHECK (status_operacional IN ('pendente','aguardando_agendamento','agendado','em_atendimento','concluido','cancelado','nao_aplicavel')),
  ADD CONSTRAINT orcamento_itens_status_fin_chk
    CHECK (status_financeiro  IN ('pendente','pago','estornado','isento','nao_aplicavel'));

CREATE INDEX IF NOT EXISTS idx_orc_itens_status_op  ON public.orcamento_itens(status_operacional);
CREATE INDEX IF NOT EXISTS idx_orc_itens_status_fin ON public.orcamento_itens(status_financeiro);
CREATE INDEX IF NOT EXISTS idx_orc_itens_orcamento  ON public.orcamento_itens(orcamento_id);

-- -------------------------------------------------------------------------
-- 2) Espelhamento bidirecional status_item ↔ status_operacional
--    Mantém 100% compat com telas legadas que escrevem/leem status_item.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_orc_itens_sync_status_legacy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Se o chamador setou apenas um lado, propaga para o outro
    IF NEW.status_operacional IS DISTINCT FROM 'pendente' AND (NEW.status_item IS NULL OR NEW.status_item = 'pendente') THEN
      NEW.status_item := CASE WHEN NEW.status_operacional IN ('agendado','em_atendimento','concluido') THEN 'agendado'
                              WHEN NEW.status_operacional = 'aguardando_agendamento' THEN 'pendente'
                              ELSE NEW.status_operacional END;
    ELSIF NEW.status_item IS DISTINCT FROM 'pendente' AND NEW.status_operacional = 'pendente' THEN
      NEW.status_operacional := CASE WHEN NEW.status_item = 'vendido' THEN 'agendado' ELSE NEW.status_item END;
      IF NEW.status_item = 'vendido' THEN NEW.status_financeiro := 'pago'; END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- status_operacional mudou → refletir em status_item (linguagem legada)
    IF NEW.status_operacional IS DISTINCT FROM OLD.status_operacional THEN
      NEW.status_item := CASE
        WHEN NEW.status_operacional IN ('agendado','em_atendimento','concluido') THEN
          CASE WHEN NEW.status_financeiro = 'pago' THEN 'vendido' ELSE 'agendado' END
        WHEN NEW.status_operacional = 'aguardando_agendamento' THEN 'pendente'
        ELSE NEW.status_operacional
      END;
    -- status_item legado mudou → refletir nos novos campos
    ELSIF NEW.status_item IS DISTINCT FROM OLD.status_item THEN
      IF NEW.status_item = 'vendido' THEN
        NEW.status_operacional := 'agendado';
        NEW.status_financeiro  := 'pago';
      ELSIF NEW.status_item IN ('agendado','cancelado','nao_aplicavel','pendente') THEN
        NEW.status_operacional := NEW.status_item;
      END IF;
    END IF;

    -- status_financeiro mudou sem tocar status_item → reprojetar status_item
    IF NEW.status_financeiro IS DISTINCT FROM OLD.status_financeiro
       AND NEW.status_item IS NOT DISTINCT FROM OLD.status_item THEN
      IF NEW.status_financeiro = 'pago' AND NEW.status_operacional IN ('agendado','em_atendimento','concluido') THEN
        NEW.status_item := 'vendido';
      END IF;
    END IF;
  END IF;

  -- Timestamps de transição (KPIs)
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status_operacional IS DISTINCT FROM OLD.status_operacional THEN
      NEW.status_op_em := now();
      IF NEW.status_operacional = 'agendado'  AND NEW.agendado_em  IS NULL THEN NEW.agendado_em  := now(); END IF;
      IF NEW.status_operacional = 'concluido' AND NEW.concluido_em IS NULL THEN NEW.concluido_em := now(); END IF;
      IF NEW.status_operacional = 'cancelado' AND NEW.cancelado_em IS NULL THEN NEW.cancelado_em := now(); END IF;
    END IF;
    IF NEW.status_financeiro IS DISTINCT FROM OLD.status_financeiro THEN
      NEW.status_fin_em := now();
      IF NEW.status_financeiro = 'pago' AND NEW.pago_em IS NULL THEN NEW.pago_em := now(); END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orc_itens_sync_status_legacy ON public.orcamento_itens;
CREATE TRIGGER trg_orc_itens_sync_status_legacy
  BEFORE INSERT OR UPDATE ON public.orcamento_itens
  FOR EACH ROW EXECUTE FUNCTION public.fn_orc_itens_sync_status_legacy();

-- -------------------------------------------------------------------------
-- 3) orcamentos: novo vocabulário (aberto|em_andamento|finalizado|cancelado)
-- -------------------------------------------------------------------------

-- Backfill do vocabulário anterior (se houver)
UPDATE public.orcamentos SET status = 'finalizado'   WHERE status = 'convertido';
UPDATE public.orcamentos SET status = 'em_andamento' WHERE status = 'parcialmente_agendado';

ALTER TABLE public.orcamentos DROP CONSTRAINT IF EXISTS orcamentos_status_chk;
ALTER TABLE public.orcamentos
  ADD CONSTRAINT orcamentos_status_chk
  CHECK (status IN ('aberto','em_andamento','finalizado','cancelado',
                    'convertido','parcialmente_agendado'));  -- legados aceitos por compat de escrita antiga

-- -------------------------------------------------------------------------
-- 4) Trigger de recálculo (dual status)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_orcamento_recalcula_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_orcamento_id uuid;
  v_total int;
  v_cancelados int;
  v_op_resolvidos int;
  v_fin_resolvidos int;
  v_op_iniciados int;
  v_fin_iniciados int;
  v_novo_status text;
  v_status_atual text;
BEGIN
  v_orcamento_id := COALESCE(NEW.orcamento_id, OLD.orcamento_id);
  IF v_orcamento_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status_operacional = 'cancelado'),
    COUNT(*) FILTER (WHERE status_operacional IN ('agendado','em_atendimento','concluido','nao_aplicavel','cancelado')),
    COUNT(*) FILTER (WHERE status_financeiro  IN ('pago','isento','nao_aplicavel') OR status_operacional = 'cancelado'),
    COUNT(*) FILTER (WHERE status_operacional <> 'pendente'),
    COUNT(*) FILTER (WHERE status_financeiro  <> 'pendente')
  INTO v_total, v_cancelados, v_op_resolvidos, v_fin_resolvidos, v_op_iniciados, v_fin_iniciados
  FROM public.orcamento_itens
  WHERE orcamento_id = v_orcamento_id;

  IF v_total = 0 THEN RETURN COALESCE(NEW, OLD); END IF;

  IF v_cancelados = v_total THEN
    v_novo_status := 'cancelado';
  ELSIF v_op_resolvidos = v_total AND v_fin_resolvidos = v_total THEN
    v_novo_status := 'finalizado';
  ELSIF v_op_iniciados > 0 OR v_fin_iniciados > 0 THEN
    v_novo_status := 'em_andamento';
  ELSE
    v_novo_status := 'aberto';
  END IF;

  SELECT status INTO v_status_atual FROM public.orcamentos WHERE id = v_orcamento_id;
  IF v_status_atual IS DISTINCT FROM v_novo_status THEN
    PERFORM set_config('app.orcamento_bypass_block', '1', true);
    UPDATE public.orcamentos SET status = v_novo_status, updated_at = now()
      WHERE id = v_orcamento_id;
    PERFORM set_config('app.orcamento_bypass_block', '0', true);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- -------------------------------------------------------------------------
-- 5) Bloqueio de edição: passa a valer para 'convertido' (histórico) e 'finalizado' (novo)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_orcamentos_bloqueia_convertido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_pode boolean := false;
  v_email text;
  v_headers jsonb;
  v_ip inet;
  v_ua text;
  v_before jsonb;
  v_after jsonb;
  v_bypass text;
BEGIN
  IF OLD.status NOT IN ('convertido','finalizado') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  BEGIN v_bypass := current_setting('app.orcamento_bypass_block', true); EXCEPTION WHEN OTHERS THEN v_bypass := NULL; END;
  IF v_bypass = '1' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_pode := v_user_id IS NOT NULL AND (
    public.has_role(v_user_id, OLD.clinica_id, 'admin'::app_role)
    OR public.has_role(v_user_id, OLD.clinica_id, 'gestor'::app_role)
  );

  IF v_pode THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  BEGIN SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  EXCEPTION WHEN OTHERS THEN v_email := NULL; END;
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_ua := v_headers->>'user-agent';
    BEGIN v_ip := NULLIF(split_part(coalesce(v_headers->>'x-forwarded-for',''), ',', 1), '')::inet;
    EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;
  EXCEPTION WHEN OTHERS THEN v_headers := NULL; END;

  v_before := to_jsonb(OLD);
  v_after := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;

  INSERT INTO public.audit_log (
    user_id, user_email, clinica_id, table_name, record_id, action,
    dados_antes, dados_depois, ip_address, user_agent
  ) VALUES (
    v_user_id, v_email, OLD.clinica_id, 'orcamentos', OLD.id::text, 'blocked_' || TG_OP,
    v_before, v_after, v_ip, v_ua
  );

  RAISE EXCEPTION 'Orçamento finalizado só pode ser alterado por Administrador ou Gestor.'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

COMMIT;
