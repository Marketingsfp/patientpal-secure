
-- 1) Tabela de controle de impressões da GR
CREATE TABLE IF NOT EXISTS public.gr_impressoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  agendamento_id uuid NOT NULL,
  via_numero smallint NOT NULL,
  impresso_por uuid,
  impresso_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gr_impressoes_agendamento ON public.gr_impressoes(agendamento_id);

ALTER TABLE public.gr_impressoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gri_select" ON public.gr_impressoes FOR SELECT TO authenticated
  USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "gri_insert" ON public.gr_impressoes FOR INSERT TO authenticated
  WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY "gri_delete" ON public.gr_impressoes FOR DELETE TO authenticated
  USING (can_manage_clinica(auth.uid(), clinica_id));

-- 2) Função helper: usuário é médico desta clínica?
CREATE OR REPLACE FUNCTION public.is_medico(_user_id uuid, _clinica_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.medicos
    WHERE user_id = _user_id AND clinica_id = _clinica_id AND ativo = true
  );
$$;

-- 3) Função genérica de auditoria
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_clinica uuid;
  v_record_id text;
  v_before jsonb;
  v_after jsonb;
BEGIN
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  EXCEPTION WHEN OTHERS THEN v_email := NULL; END;

  IF TG_OP = 'DELETE' THEN
    v_before := to_jsonb(OLD);
    v_after := NULL;
    v_record_id := (to_jsonb(OLD)->>'id');
    v_clinica := NULLIF(to_jsonb(OLD)->>'clinica_id','')::uuid;
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_record_id := (to_jsonb(NEW)->>'id');
    v_clinica := NULLIF(to_jsonb(NEW)->>'clinica_id','')::uuid;
  ELSE
    v_before := NULL;
    v_after := to_jsonb(NEW);
    v_record_id := (to_jsonb(NEW)->>'id');
    v_clinica := NULLIF(to_jsonb(NEW)->>'clinica_id','')::uuid;
  END IF;

  INSERT INTO public.audit_log (user_id, user_email, clinica_id, table_name, record_id, action, dados_antes, dados_depois)
  VALUES (v_user_id, v_email, v_clinica, TG_TABLE_NAME, v_record_id, TG_OP, v_before, v_after);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4) Aplicar triggers nas tabelas críticas
DROP TRIGGER IF EXISTS trg_audit_agendamentos ON public.agendamentos;
CREATE TRIGGER trg_audit_agendamentos
AFTER INSERT OR UPDATE OR DELETE ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_pacientes ON public.pacientes;
CREATE TRIGGER trg_audit_pacientes
AFTER INSERT OR UPDATE OR DELETE ON public.pacientes
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_fin_lancamentos ON public.fin_lancamentos;
CREATE TRIGGER trg_audit_fin_lancamentos
AFTER INSERT OR UPDATE OR DELETE ON public.fin_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_medicos ON public.medicos;
CREATE TRIGGER trg_audit_medicos
AFTER INSERT OR UPDATE OR DELETE ON public.medicos
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_procedimentos ON public.procedimentos;
CREATE TRIGGER trg_audit_procedimentos
AFTER INSERT OR UPDATE OR DELETE ON public.procedimentos
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_gr_impressoes ON public.gr_impressoes;
CREATE TRIGGER trg_audit_gr_impressoes
AFTER INSERT OR DELETE ON public.gr_impressoes
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
