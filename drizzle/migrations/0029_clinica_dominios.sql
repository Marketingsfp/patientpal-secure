-- Endereço de acesso próprio por clínica (subdomínio do site institucional).
CREATE TABLE public.clinica_dominios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  hostname text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clinica_dominios_clinica_idx ON public.clinica_dominios(clinica_id);

CREATE OR REPLACE FUNCTION public.normalizar_hostname(_h text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(regexp_replace(regexp_replace(split_part(lower(btrim(coalesce(_h,''))), ':', 1), '^www\.', ''), '\.$', ''), '')
$$;

CREATE OR REPLACE FUNCTION public.clinica_dominios_normaliza()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.hostname := public.normalizar_hostname(NEW.hostname);
  IF NEW.hostname IS NULL OR NEW.hostname !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' THEN
    RAISE EXCEPTION 'Endereço inválido';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER clinica_dominios_normaliza_bi BEFORE INSERT OR UPDATE ON public.clinica_dominios
FOR EACH ROW EXECUTE FUNCTION public.clinica_dominios_normaliza();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinica_dominios TO authenticated;
GRANT ALL ON public.clinica_dominios TO service_role;
ALTER TABLE public.clinica_dominios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinica_dominios_admin_all" ON public.clinica_dominios
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), clinica_id, 'admin') OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), clinica_id, 'admin') OR public.is_platform_admin(auth.uid()));

-- Dados mínimos e não sensíveis para a tela de login.
CREATE OR REPLACE FUNCTION public.clinica_por_dominio(_hostname text)
RETURNS TABLE(clinica_id uuid, nome text, logo_url text, "primary" text, accent text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.nome, c.branding->>'logo_url', c.branding->>'primary', c.branding->>'accent'
  FROM public.clinica_dominios d JOIN public.clinicas c ON c.id = d.clinica_id
  WHERE d.ativo AND d.hostname = public.normalizar_hostname(_hostname)
  LIMIT 1
$$;

-- Fallback de teste (?clinica=<id>): mesmo retorno restrito.
CREATE OR REPLACE FUNCTION public.clinica_acesso_por_id(_clinica_id uuid)
RETURNS TABLE(clinica_id uuid, nome text, logo_url text, "primary" text, accent text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.nome, c.branding->>'logo_url', c.branding->>'primary', c.branding->>'accent'
  FROM public.clinicas c WHERE c.id = _clinica_id
$$;

REVOKE ALL ON FUNCTION public.clinica_por_dominio(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clinica_acesso_por_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinica_por_dominio(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinica_acesso_por_id(uuid) TO anon, authenticated;