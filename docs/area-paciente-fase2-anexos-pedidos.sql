-- APROVADA em 17/10/2026; validação de caminho restrita a arquivos clínicos.
-- Banco compartilhado entre prévia e produção. Nenhum dado clínico é migrado aqui.
-- As tabelas paciente_arquivos e documentos_emitidos estavam vazias na conferência.

-- Helper de liberação: somente papéis ativos confirmados, na própria clínica.
CREATE OR REPLACE FUNCTION public.portal_pode_liberar(_clinica_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.user_id = auth.uid() AND m.clinica_id = _clinica_id
      AND m.ativo AND m.role::text IN
        ('admin','gestor','medico','enfermeiro','recepcao','supervisor')
  );
$$;
REVOKE ALL ON FUNCTION public.portal_pode_liberar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_pode_liberar(uuid) TO authenticated, service_role;

ALTER TABLE public.paciente_arquivos
  ADD COLUMN finalidade_portal text NOT NULL DEFAULT 'interno',
  ADD COLUMN liberado_paciente_em timestamptz,
  ADD COLUMN liberado_paciente_por uuid;
ALTER TABLE public.paciente_arquivos
  ADD CONSTRAINT paciente_arquivos_finalidade_portal_check
    CHECK (finalidade_portal IN ('interno','clinico'));
COMMENT ON COLUMN public.paciente_arquivos.finalidade_portal IS
  'Classificação explícita da equipe. Interno por padrão; administrativos e contratos não são clínicos. Nunca inferir pelo nome/extensão.';
CREATE INDEX idx_paciente_arquivos_portal
  ON public.paciente_arquivos (clinica_id, paciente_id)
  WHERE liberado_paciente_em IS NOT NULL AND finalidade_portal = 'clinico';
-- Mantém as políticas SELECT/INSERT/DELETE existentes. UPDATE novo restrito à alçada.
GRANT UPDATE ON public.paciente_arquivos TO authenticated;
GRANT ALL ON public.paciente_arquivos TO service_role;
CREATE POLICY paciente_arquivos_portal_update ON public.paciente_arquivos
  FOR UPDATE TO authenticated
  USING (public.portal_pode_liberar(clinica_id))
  WITH CHECK (public.portal_pode_liberar(clinica_id));

CREATE TABLE public.pedidos_exame (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id),
  medico_id uuid REFERENCES public.medicos(id),
  profissional_id uuid,
  agendamento_id uuid REFERENCES public.agendamentos(id),
  atendimento_id uuid REFERENCES public.fin_atendimentos(id),
  data date NOT NULL DEFAULT CURRENT_DATE,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  indicacao_clinica text NOT NULL DEFAULT '',
  observacao text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'emitido' CHECK (status IN ('emitido','cancelado')),
  pdf_caminho text,
  liberado_paciente_em timestamptz,
  liberado_paciente_por uuid,
  documento_origem_id uuid UNIQUE REFERENCES public.documentos_emitidos(id),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelado_em timestamptz,
  cancelado_por uuid
);
GRANT SELECT, INSERT, UPDATE ON public.pedidos_exame TO authenticated;
GRANT ALL ON public.pedidos_exame TO service_role;
ALTER TABLE public.pedidos_exame ENABLE ROW LEVEL SECURITY;
CREATE POLICY pedidos_exame_select ON public.pedidos_exame
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY pedidos_exame_insert ON public.pedidos_exame
  FOR INSERT TO authenticated
  WITH CHECK (public.portal_pode_liberar(clinica_id) AND created_by = auth.uid());
CREATE POLICY pedidos_exame_update ON public.pedidos_exame
  FOR UPDATE TO authenticated
  USING (public.portal_pode_liberar(clinica_id))
  WITH CHECK (public.portal_pode_liberar(clinica_id));
-- Não há DELETE: cancelamento conserva histórico.
CREATE INDEX idx_pedidos_exame_paciente
  ON public.pedidos_exame (clinica_id, paciente_id, data DESC);
CREATE INDEX idx_pedidos_exame_portal
  ON public.pedidos_exame (clinica_id, paciente_id)
  WHERE liberado_paciente_em IS NOT NULL AND status = 'emitido';
COMMENT ON COLUMN public.pedidos_exame.itens IS
  'Array de itens {procedimento_id?, codigo?, nome, texto_livre?}. Código/nome da emissão são históricos, não recalculados.';
COMMENT ON COLUMN public.pedidos_exame.profissional_id IS
  'ID do usuário profissional, validado como membro ativo da mesma clínica; não referencia auth.users.';
COMMENT ON COLUMN public.pedidos_exame.pdf_caminho IS
  'PDF privado em paciente-arquivos: {clinica}/{paciente}/pedidos-exame/...; nunca URL pública.';
COMMENT ON COLUMN public.pedidos_exame.documento_origem_id IS
  'Identificação idempotente de eventual cópia de pedido antigo, preservando original. Nenhuma cópia por texto/título inferido.';

-- Expansão aditiva: mantém o CHECK e o tipo antigo dos links existentes.
-- Novos links usam tipo=documento + origem_extensao; o servidor resolve a origem explicitamente.
ALTER TABLE public.portal_links ADD COLUMN origem_extensao text
  CHECK (origem_extensao IN ('anexo','pedido_exame'));
COMMENT ON COLUMN public.portal_links.origem_extensao IS
  'Origem nova para links tipo documento. Exige revalidação de sessão, clínica, paciente e liberação a cada abertura.';
COMMENT ON COLUMN public.portal_paciente_config.auto_liberar IS
  'Opções independentes por clínica. Ausente/false = desligado. Tipos: atestado, receita, laudo, declaracao, outro, exame, anexo_clinico, foto_clinica, pedido_exame.';

-- Novo guard de vínculos/classificação/liberação dos anexos.
CREATE OR REPLACE FUNCTION public.portal_validar_anexo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mudou boolean;
  ator uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pacientes p
    WHERE p.id = NEW.paciente_id AND p.clinica_id = NEW.clinica_id) THEN
    RAISE EXCEPTION 'Vínculo de paciente inválido.' USING ERRCODE = '42501';
  END IF;
  -- Upload interno legado/service_role não depende do formato nem de auth.uid().
  -- Classificar como clínico ou liberar exige o caminho isolado completo.
  IF (NEW.finalidade_portal = 'clinico' OR NEW.liberado_paciente_em IS NOT NULL)
    AND NEW.caminho NOT LIKE NEW.clinica_id::text || '/' || NEW.paciente_id::text || '/' || NEW.tipo || '/%' THEN
    RAISE EXCEPTION 'Caminho de arquivo inválido.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.clinica_id, NEW.paciente_id, NEW.caminho, NEW.tipo, NEW.enviado_por, NEW.created_at)
      IS DISTINCT FROM (OLD.clinica_id, OLD.paciente_id, OLD.caminho, OLD.tipo, OLD.enviado_por, OLD.created_at) THEN
      RAISE EXCEPTION 'Identidade do arquivo não pode mudar.' USING ERRCODE = '42501';
    END IF;
    mudou := (NEW.finalidade_portal, NEW.liberado_paciente_em, NEW.liberado_paciente_por)
      IS DISTINCT FROM (OLD.finalidade_portal, OLD.liberado_paciente_em, OLD.liberado_paciente_por);
  ELSE
    mudou := NEW.finalidade_portal <> 'interno' OR NEW.liberado_paciente_em IS NOT NULL;
  END IF;
  IF mudou AND auth.uid() IS NOT NULL AND NOT public.portal_pode_liberar(NEW.clinica_id) THEN
    RAISE EXCEPTION 'Sem permissão para liberar documentos.' USING ERRCODE = '42501';
  END IF;
  IF NEW.finalidade_portal = 'interno' THEN
    NEW.liberado_paciente_em := NULL;
    NEW.liberado_paciente_por := NULL;
  ELSIF TG_OP = 'INSERT' AND NEW.liberado_paciente_em IS NULL
    AND EXISTS (SELECT 1 FROM public.portal_paciente_config c WHERE c.clinica_id = NEW.clinica_id
      AND c.ativo AND c.auto_liberar ->> (CASE WHEN NEW.tipo = 'foto' THEN 'foto_clinica' ELSE 'anexo_clinico' END) = 'true') THEN
    NEW.liberado_paciente_em := now();
    NEW.liberado_paciente_por := NULL;
  END IF;
  IF NEW.liberado_paciente_em IS NULL THEN NEW.liberado_paciente_por := NULL;
  ELSIF mudou THEN
    ator := coalesce(auth.uid(), NEW.liberado_paciente_por, NEW.enviado_por);
    IF NOT EXISTS (SELECT 1 FROM public.clinica_memberships m
      WHERE m.user_id = ator AND m.clinica_id = NEW.clinica_id AND m.ativo
        AND m.role::text IN ('admin','gestor','medico','enfermeiro','recepcao','supervisor')) THEN
      RAISE EXCEPTION 'Responsável pela liberação inválido.' USING ERRCODE = '42501';
    END IF;
    NEW.liberado_paciente_por := ator;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_validar_anexo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_validar_anexo() TO service_role;
CREATE TRIGGER trg_portal_validar_anexo BEFORE INSERT OR UPDATE ON public.paciente_arquivos
  FOR EACH ROW EXECUTE FUNCTION public.portal_validar_anexo();

CREATE OR REPLACE FUNCTION public.portal_validar_pedido_exame()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item jsonb;
  mudou boolean;
  ator uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pacientes p WHERE p.id = NEW.paciente_id AND p.clinica_id = NEW.clinica_id)
    OR (NEW.medico_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.medicos m WHERE m.id = NEW.medico_id AND m.clinica_id = NEW.clinica_id))
    OR (NEW.profissional_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clinica_memberships m WHERE m.user_id = NEW.profissional_id AND m.clinica_id = NEW.clinica_id AND m.ativo))
    OR (NEW.agendamento_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.agendamentos a WHERE a.id = NEW.agendamento_id AND a.clinica_id = NEW.clinica_id AND a.paciente_id = NEW.paciente_id))
    OR (NEW.atendimento_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fin_atendimentos a WHERE a.id = NEW.atendimento_id AND a.clinica_id = NEW.clinica_id AND a.paciente_id = NEW.paciente_id))
    OR (NEW.documento_origem_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documentos_emitidos d WHERE d.id = NEW.documento_origem_id AND d.clinica_id = NEW.clinica_id AND d.paciente_id = NEW.paciente_id)) THEN
    RAISE EXCEPTION 'Vínculos do pedido inválidos.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(NEW.itens) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Lista de exames inválida.';
  END IF;
  IF jsonb_array_length(NEW.itens) < 1 OR jsonb_array_length(NEW.itens) > 100 THEN
    RAISE EXCEPTION 'Informe de 1 a 100 exames.';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.itens) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR coalesce(length(btrim(item->>'nome')), 0) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'Item de exame inválido.';
    END IF;
    IF item->>'procedimento_id' IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.procedimentos p WHERE p.id = (item->>'procedimento_id')::uuid
        AND p.clinica_id = NEW.clinica_id) THEN
      RAISE EXCEPTION 'Procedimento de outra clínica.' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  IF NEW.pdf_caminho IS NOT NULL AND NEW.pdf_caminho NOT LIKE
    NEW.clinica_id::text || '/' || NEW.paciente_id::text || '/pedidos-exame/%' THEN
    RAISE EXCEPTION 'Caminho do PDF inválido.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.clinica_id, NEW.paciente_id, NEW.medico_id, NEW.profissional_id, NEW.agendamento_id,
        NEW.atendimento_id, NEW.data, NEW.itens, NEW.indicacao_clinica, NEW.observacao,
        NEW.documento_origem_id, NEW.created_by, NEW.created_at)
      IS DISTINCT FROM (OLD.clinica_id, OLD.paciente_id, OLD.medico_id, OLD.profissional_id,
        OLD.agendamento_id, OLD.atendimento_id, OLD.data, OLD.itens, OLD.indicacao_clinica,
        OLD.observacao, OLD.documento_origem_id, OLD.created_by, OLD.created_at) THEN
      RAISE EXCEPTION 'Pedido emitido é imutável; cancele e emita outro.' USING ERRCODE = '42501';
    END IF;
    IF OLD.status = 'cancelado' AND NEW.status <> 'cancelado' THEN
      RAISE EXCEPTION 'Pedido cancelado não pode ser reaberto.';
    END IF;
    mudou := (NEW.liberado_paciente_em, NEW.liberado_paciente_por)
      IS DISTINCT FROM (OLD.liberado_paciente_em, OLD.liberado_paciente_por);
    IF OLD.pdf_caminho IS NOT NULL AND NEW.pdf_caminho IS DISTINCT FROM OLD.pdf_caminho THEN
      RAISE EXCEPTION 'PDF emitido não pode ser substituído.';
    END IF;
    IF NEW.status = 'cancelado' AND OLD.status <> 'cancelado' THEN
      NEW.cancelado_em := now();
      NEW.cancelado_por := coalesce(auth.uid(), NEW.cancelado_por);
    ELSE
      NEW.cancelado_em := OLD.cancelado_em;
      NEW.cancelado_por := OLD.cancelado_por;
    END IF;
  ELSE
    mudou := NEW.liberado_paciente_em IS NOT NULL;
    IF NEW.status <> 'emitido' THEN RAISE EXCEPTION 'Novo pedido deve estar emitido.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.clinica_memberships m
      WHERE m.user_id = NEW.created_by AND m.clinica_id = NEW.clinica_id AND m.ativo
        AND m.role::text IN ('admin','gestor','medico','enfermeiro','recepcao','supervisor')) THEN
      RAISE EXCEPTION 'Emissor sem permissão.' USING ERRCODE = '42501';
    END IF;
    NEW.cancelado_em := NULL;
    NEW.cancelado_por := NULL;
    IF NEW.liberado_paciente_em IS NULL AND EXISTS (SELECT 1 FROM public.portal_paciente_config c
      WHERE c.clinica_id = NEW.clinica_id AND c.ativo AND c.auto_liberar->>'pedido_exame' = 'true') THEN
      NEW.liberado_paciente_em := now();
      NEW.liberado_paciente_por := NEW.created_by;
    END IF;
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.portal_pode_liberar(NEW.clinica_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar pedido.' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'cancelado' OR NEW.liberado_paciente_em IS NULL THEN
    NEW.liberado_paciente_em := NULL;
    NEW.liberado_paciente_por := NULL;
  ELSIF mudou THEN
    ator := coalesce(auth.uid(), NEW.liberado_paciente_por);
    IF NOT EXISTS (SELECT 1 FROM public.clinica_memberships m
      WHERE m.user_id = ator AND m.clinica_id = NEW.clinica_id AND m.ativo
        AND m.role::text IN ('admin','gestor','medico','enfermeiro','recepcao','supervisor')) THEN
      RAISE EXCEPTION 'Responsável pela liberação inválido.' USING ERRCODE = '42501';
    END IF;
    NEW.liberado_paciente_por := ator;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_validar_pedido_exame() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_validar_pedido_exame() TO service_role;
CREATE TRIGGER trg_portal_validar_pedido BEFORE INSERT OR UPDATE ON public.pedidos_exame
  FOR EACH ROW EXECUTE FUNCTION public.portal_validar_pedido_exame();

-- Auditoria de metadados. Sem texto clínico, arquivo, CPF ou tokens.
CREATE OR REPLACE FUNCTION public.portal_auditar_arquivo_e_pedido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  antes jsonb;
  depois jsonb;
  ator uuid;
  evento text;
BEGIN
  depois := jsonb_build_object('liberado_em', NEW.liberado_paciente_em,
    'liberado_por', NEW.liberado_paciente_por);
  IF TG_TABLE_NAME = 'paciente_arquivos' THEN
    depois := depois || jsonb_build_object('finalidade', NEW.finalidade_portal, 'tipo', NEW.tipo);
    ator := coalesce(auth.uid(), NEW.liberado_paciente_por, NEW.enviado_por);
  ELSE
    depois := depois || jsonb_build_object('status', NEW.status);
    ator := coalesce(auth.uid(), NEW.cancelado_por, NEW.liberado_paciente_por, NEW.created_by);
  END IF;
  IF TG_OP = 'UPDATE' THEN
    antes := jsonb_build_object('liberado_em', OLD.liberado_paciente_em, 'liberado_por', OLD.liberado_paciente_por);
    IF TG_TABLE_NAME = 'paciente_arquivos' THEN
      antes := antes || jsonb_build_object('finalidade', OLD.finalidade_portal, 'tipo', OLD.tipo);
    ELSE antes := antes || jsonb_build_object('status', OLD.status);
    END IF;
    IF antes = depois THEN RETURN NEW; END IF;
  END IF;
  evento := CASE WHEN TG_OP = 'INSERT' THEN 'equipe_registrou'
    WHEN NEW.liberado_paciente_em IS NOT NULL AND OLD.liberado_paciente_em IS NULL THEN 'equipe_liberou'
    WHEN NEW.liberado_paciente_em IS NULL AND OLD.liberado_paciente_em IS NOT NULL THEN 'equipe_retirou'
    ELSE 'equipe_alterou' END;
  INSERT INTO public.audit_log (user_id, clinica_id, table_name, record_id, action, dados_antes, dados_depois)
    VALUES (ator, NEW.clinica_id, TG_TABLE_NAME, NEW.id::text, TG_OP, antes, depois);
  INSERT INTO public.portal_acessos (clinica_id, paciente_id, evento, detalhe)
    VALUES (NEW.clinica_id, NEW.paciente_id, evento,
      jsonb_build_object('por', ator, 'origem', TG_TABLE_NAME, 'id', NEW.id, 'antes', antes, 'depois', depois));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_auditar_arquivo_e_pedido() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_auditar_arquivo_e_pedido() TO service_role;
CREATE TRIGGER trg_portal_auditar_anexo AFTER INSERT OR UPDATE ON public.paciente_arquivos
  FOR EACH ROW EXECUTE FUNCTION public.portal_auditar_arquivo_e_pedido();
CREATE TRIGGER trg_portal_auditar_pedido AFTER INSERT OR UPDATE ON public.pedidos_exame
  FOR EACH ROW EXECUTE FUNCTION public.portal_auditar_arquivo_e_pedido();

-- Não altera o comportamento dos gatilhos antigos; fecha apenas chamada direta pública.
REVOKE ALL ON FUNCTION public.portal_auto_liberar_documento() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_auto_liberar_exame() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_carimbar_liberacao() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_auto_liberar_documento() TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_auto_liberar_exame() TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_carimbar_liberacao() TO service_role;

-- Nenhum backfill: não há registros de documentos_emitidos para copiar nesta conferência.
-- Nenhum bucket novo: PDFs ficam no bucket privado paciente-arquivos já existente.
-- Nenhuma política pública/anon nova. Nenhuma alteração em financeiro ou notas fiscais.