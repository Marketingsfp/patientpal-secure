
-- Tabela de auditoria
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID,
  user_id UUID,
  user_email TEXT,
  table_name TEXT NOT NULL,
  record_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  dados_antes JSONB,
  dados_depois JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_clinica_data ON public.audit_log(clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_table ON public.audit_log(table_name);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores podem ver auditoria"
ON public.audit_log FOR SELECT
USING (clinica_id IS NULL OR can_manage_clinica(auth.uid(), clinica_id));

-- Função de trigger genérica
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinica_id UUID;
  _record_id TEXT;
  _email TEXT;
  _user_id UUID := auth.uid();
BEGIN
  IF TG_OP = 'DELETE' THEN
    BEGIN _clinica_id := (to_jsonb(OLD)->>'clinica_id')::uuid; EXCEPTION WHEN OTHERS THEN _clinica_id := NULL; END;
    BEGIN _record_id := (to_jsonb(OLD)->>'id'); EXCEPTION WHEN OTHERS THEN _record_id := NULL; END;
  ELSE
    BEGIN _clinica_id := (to_jsonb(NEW)->>'clinica_id')::uuid; EXCEPTION WHEN OTHERS THEN _clinica_id := NULL; END;
    BEGIN _record_id := (to_jsonb(NEW)->>'id'); EXCEPTION WHEN OTHERS THEN _record_id := NULL; END;
  END IF;

  IF _user_id IS NOT NULL THEN
    SELECT email INTO _email FROM auth.users WHERE id = _user_id;
  END IF;

  INSERT INTO public.audit_log (clinica_id, user_id, user_email, table_name, record_id, action, dados_antes, dados_depois)
  VALUES (
    _clinica_id, _user_id, _email, TG_TABLE_NAME, _record_id, TG_OP,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Aplicar triggers em tabelas principais
DO $$
DECLARE _tbl TEXT;
BEGIN
  FOR _tbl IN SELECT unnest(ARRAY[
    'agendamentos','pacientes','medicos','procedimentos',
    'fin_lancamentos','contratos_assinatura','contrato_mensalidades',
    'planos_assinatura','especialidades','medico_disponibilidades',
    'orcamentos','clinicas'
  ]) LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=_tbl) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I;', _tbl, _tbl);
      EXECUTE format('CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();', _tbl, _tbl);
    END IF;
  END LOOP;
END $$;
