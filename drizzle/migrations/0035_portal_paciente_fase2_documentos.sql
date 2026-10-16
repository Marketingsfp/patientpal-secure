ALTER TABLE public.documentos_emitidos
  ADD COLUMN IF NOT EXISTS liberado_paciente_em timestamptz,
  ADD COLUMN IF NOT EXISTS liberado_paciente_por uuid;
ALTER TABLE public.exame_resultados
  ADD COLUMN IF NOT EXISTS liberado_paciente_em timestamptz,
  ADD COLUMN IF NOT EXISTS liberado_paciente_por uuid;
COMMENT ON COLUMN public.documentos_emitidos.liberado_paciente_em IS 'Quando foi liberado na Área do Paciente (null = não liberado).';
COMMENT ON COLUMN public.exame_resultados.liberado_paciente_em IS 'Quando foi liberado na Área do Paciente (null = não liberado).';
CREATE INDEX IF NOT EXISTS idx_documentos_emitidos_portal ON public.documentos_emitidos (clinica_id, paciente_id) WHERE liberado_paciente_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exame_resultados_portal ON public.exame_resultados (clinica_id, paciente_id) WHERE liberado_paciente_em IS NOT NULL;

ALTER TABLE public.portal_paciente_config
  ADD COLUMN IF NOT EXISTS auto_liberar jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.portal_paciente_config.auto_liberar IS 'Tipos liberados automaticamente ao finalizar: atestado, receita, laudo, declaracao, outro, exame (true/false). Padrão: nenhum.';

-- Links temporários de download (token só em hash, 5 minutos).
CREATE TABLE IF NOT EXISTS public.portal_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL,
  sessao_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('documento','exame','recibo','nfse_pdf','nfse_xml')),
  ref_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expira_em timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.portal_links TO service_role;
ALTER TABLE public.portal_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_portal_links_expira ON public.portal_links (expira_em);

-- Quem liberou/retirou pela tela da equipe fica gravado.
CREATE OR REPLACE FUNCTION public.portal_carimbar_liberacao()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.liberado_paciente_em IS DISTINCT FROM OLD.liberado_paciente_em AND auth.uid() IS NOT NULL THEN
    NEW.liberado_paciente_por := CASE WHEN NEW.liberado_paciente_em IS NULL THEN NULL ELSE auth.uid() END;
  END IF;
  RETURN NEW;
END $$;

-- Liberação automática ao finalizar (só se a clínica ligou para o tipo).
CREATE OR REPLACE FUNCTION public.portal_auto_liberar_documento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.liberado_paciente_em IS NULL AND NEW.paciente_id IS NOT NULL AND NEW.tipo::text <> 'contrato'
     AND EXISTS (SELECT 1 FROM portal_paciente_config c WHERE c.clinica_id = NEW.clinica_id
                 AND coalesce((c.auto_liberar ->> NEW.tipo::text)::boolean, false)) THEN
    NEW.liberado_paciente_em := now();
    NEW.liberado_paciente_por := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.portal_auto_liberar_exame()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.liberado_paciente_em IS NULL AND NEW.paciente_id IS NOT NULL AND NEW.status::text <> 'pendente'
     AND (TG_OP = 'INSERT' OR OLD.status::text = 'pendente')
     AND EXISTS (SELECT 1 FROM portal_paciente_config c WHERE c.clinica_id = NEW.clinica_id
                 AND coalesce((c.auto_liberar ->> 'exame')::boolean, false)) THEN
    NEW.liberado_paciente_em := now();
    NEW.liberado_paciente_por := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_portal_carimbo_doc ON public.documentos_emitidos;
CREATE TRIGGER trg_portal_carimbo_doc BEFORE UPDATE ON public.documentos_emitidos
  FOR EACH ROW EXECUTE FUNCTION public.portal_carimbar_liberacao();
DROP TRIGGER IF EXISTS trg_portal_carimbo_exame ON public.exame_resultados;
CREATE TRIGGER trg_portal_carimbo_exame BEFORE UPDATE ON public.exame_resultados
  FOR EACH ROW EXECUTE FUNCTION public.portal_carimbar_liberacao();
DROP TRIGGER IF EXISTS trg_portal_auto_doc ON public.documentos_emitidos;
CREATE TRIGGER trg_portal_auto_doc BEFORE INSERT ON public.documentos_emitidos
  FOR EACH ROW EXECUTE FUNCTION public.portal_auto_liberar_documento();
DROP TRIGGER IF EXISTS trg_portal_auto_exame ON public.exame_resultados;
CREATE TRIGGER trg_portal_auto_exame BEFORE INSERT OR UPDATE OF status ON public.exame_resultados
  FOR EACH ROW EXECUTE FUNCTION public.portal_auto_liberar_exame();