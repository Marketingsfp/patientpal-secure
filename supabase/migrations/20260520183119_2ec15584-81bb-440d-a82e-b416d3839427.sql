
CREATE TABLE public.mkt_landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  titulo text NOT NULL,
  subtitulo text,
  hero_imagem_url text,
  cor_primaria text DEFAULT '#0f172a',
  cta_label text DEFAULT 'Quero saber mais',
  campos jsonb NOT NULL DEFAULT '["nome","telefone"]'::jsonb,
  conteudo_html text,
  status text NOT NULL DEFAULT 'rascunho',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.mkt_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  landing_page_id uuid REFERENCES public.mkt_landing_pages(id) ON DELETE SET NULL,
  nome text NOT NULL,
  telefone text,
  email text,
  mensagem text,
  origem text DEFAULT 'landing_page',
  status text NOT NULL DEFAULT 'novo',
  dados jsonb DEFAULT '{}'::jsonb,
  paciente_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.mkt_segmentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.mkt_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  campanha_id uuid REFERENCES public.campanhas_marketing(id) ON DELETE SET NULL,
  canal text NOT NULL,
  destinatario text NOT NULL,
  paciente_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pendente',
  erro text,
  enviado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mkt_leads_clinica ON public.mkt_leads(clinica_id, created_at DESC);
CREATE INDEX idx_mkt_envios_clinica ON public.mkt_envios(clinica_id, created_at DESC);
CREATE INDEX idx_mkt_landing_slug ON public.mkt_landing_pages(slug);

ALTER TABLE public.mkt_landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_segmentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros gerenciam landing pages"
ON public.mkt_landing_pages FOR ALL TO authenticated
USING (public.is_member(auth.uid(), clinica_id))
WITH CHECK (public.is_member(auth.uid(), clinica_id));

CREATE POLICY "Landing pages publicadas são públicas"
ON public.mkt_landing_pages FOR SELECT TO anon
USING (status = 'publicada');

CREATE POLICY "Membros gerenciam leads"
ON public.mkt_leads FOR ALL TO authenticated
USING (public.is_member(auth.uid(), clinica_id))
WITH CHECK (public.is_member(auth.uid(), clinica_id));

CREATE POLICY "Qualquer um pode capturar lead"
ON public.mkt_leads FOR INSERT TO anon
WITH CHECK (true);

CREATE POLICY "Membros gerenciam segmentos"
ON public.mkt_segmentos FOR ALL TO authenticated
USING (public.is_member(auth.uid(), clinica_id))
WITH CHECK (public.is_member(auth.uid(), clinica_id));

CREATE POLICY "Membros gerenciam envios"
ON public.mkt_envios FOR ALL TO authenticated
USING (public.is_member(auth.uid(), clinica_id))
WITH CHECK (public.is_member(auth.uid(), clinica_id));

CREATE TRIGGER trg_mkt_landing_touch BEFORE UPDATE ON public.mkt_landing_pages FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_mkt_leads_touch BEFORE UPDATE ON public.mkt_leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_mkt_segmentos_touch BEFORE UPDATE ON public.mkt_segmentos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
