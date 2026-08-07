-- 1) Relatórios internos: leitura só admin/gestor
DROP POLICY IF EXISTS dev_rel_dest_select ON public.dev_relatorio_destinatarios;
CREATE POLICY dev_rel_dest_select ON public.dev_relatorio_destinatarios
  FOR SELECT TO authenticated USING (public.is_admin_ou_gestor(auth.uid()));

DROP POLICY IF EXISTS dev_rel_entradas_select ON public.dev_relatorio_entradas;
CREATE POLICY dev_rel_entradas_select ON public.dev_relatorio_entradas
  FOR SELECT TO authenticated USING (public.is_admin_ou_gestor(auth.uid()));

DROP POLICY IF EXISTS dev_rel_envios_select ON public.dev_relatorio_envios;
CREATE POLICY dev_rel_envios_select ON public.dev_relatorio_envios
  FOR SELECT TO authenticated USING (public.is_admin_ou_gestor(auth.uid()));

-- 2) sistema_planos: remove leitura aberta (política ALL de admin global permanece)
DROP POLICY IF EXISTS "Planos visíveis para todos autenticados" ON public.sistema_planos;

-- 3) planos_assinatura_arquivo: clinica obrigatória + políticas de escrita
ALTER TABLE public.planos_assinatura_arquivo ALTER COLUMN clinica_id SET NOT NULL;

DROP POLICY IF EXISTS paa_select_admin ON public.planos_assinatura_arquivo;
CREATE POLICY paa_select_admin ON public.planos_assinatura_arquivo
  FOR SELECT TO authenticated
  USING (clinica_id IS NOT NULL AND public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY paa_insert_admin ON public.planos_assinatura_arquivo
  FOR INSERT TO authenticated
  WITH CHECK (clinica_id IS NOT NULL AND public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY paa_update_admin ON public.planos_assinatura_arquivo
  FOR UPDATE TO authenticated
  USING (clinica_id IS NOT NULL AND public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (clinica_id IS NOT NULL AND public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY paa_delete_admin ON public.planos_assinatura_arquivo
  FOR DELETE TO authenticated
  USING (clinica_id IS NOT NULL AND public.can_manage_clinica(auth.uid(), clinica_id));

-- 4) mkt_leads: validação de conteúdo + limite anti-spam para inserções anônimas
CREATE OR REPLACE FUNCTION public.fn_mkt_leads_valida_publico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recentes integer;
BEGIN
  NEW.nome := btrim(NEW.nome);
  IF NEW.nome IS NULL OR length(NEW.nome) < 2 OR length(NEW.nome) > 120 THEN
    RAISE EXCEPTION 'Nome inválido';
  END IF;

  IF NEW.email IS NOT NULL THEN
    NEW.email := btrim(lower(NEW.email));
    IF NEW.email = '' THEN
      NEW.email := NULL;
    ELSIF length(NEW.email) > 160 OR NEW.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RAISE EXCEPTION 'E-mail inválido';
    END IF;
  END IF;

  IF NEW.telefone IS NOT NULL THEN
    NEW.telefone := btrim(NEW.telefone);
    IF NEW.telefone = '' THEN
      NEW.telefone := NULL;
    ELSIF length(NEW.telefone) > 25 OR NEW.telefone !~ '^[0-9()+\-\s]+$' THEN
      RAISE EXCEPTION 'Telefone inválido';
    END IF;
  END IF;

  IF NEW.mensagem IS NOT NULL AND length(NEW.mensagem) > 2000 THEN
    RAISE EXCEPTION 'Mensagem muito longa';
  END IF;

  -- Limite anti-spam apenas para captura pública (anônima)
  IF auth.role() = 'anon' AND NEW.landing_page_id IS NOT NULL THEN
    SELECT count(*) INTO recentes
    FROM public.mkt_leads l
    WHERE l.landing_page_id = NEW.landing_page_id
      AND l.created_at > now() - interval '1 minute';
    IF recentes >= 5 THEN
      RAISE EXCEPTION 'Muitos envios em sequência. Tente novamente em instantes.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mkt_leads_valida_publico ON public.mkt_leads;
CREATE TRIGGER trg_mkt_leads_valida_publico
  BEFORE INSERT OR UPDATE ON public.mkt_leads
  FOR EACH ROW EXECUTE FUNCTION public.fn_mkt_leads_valida_publico();