CREATE TABLE IF NOT EXISTS public.mkt_landing_pages (
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
CREATE INDEX IF NOT EXISTS idx_mkt_landing_slug ON public.mkt_landing_pages(slug);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_landing_pages TO authenticated;
GRANT SELECT ON public.mkt_landing_pages TO anon;
GRANT ALL ON public.mkt_landing_pages TO service_role;
ALTER TABLE public.mkt_landing_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Membros gerenciam landing pages" ON public.mkt_landing_pages;
CREATE POLICY "Membros gerenciam landing pages" ON public.mkt_landing_pages FOR ALL TO authenticated
  USING (public.is_member(auth.uid(), clinica_id)) WITH CHECK (public.is_member(auth.uid(), clinica_id));
DROP POLICY IF EXISTS "Landing pages publicadas sao publicas" ON public.mkt_landing_pages;
CREATE POLICY "Landing pages publicadas sao publicas" ON public.mkt_landing_pages FOR SELECT TO anon
  USING (status = 'publicada');

CREATE TABLE IF NOT EXISTS public.mkt_leads (
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
CREATE INDEX IF NOT EXISTS idx_mkt_leads_clinica ON public.mkt_leads(clinica_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_leads TO authenticated;
GRANT INSERT ON public.mkt_leads TO anon;
GRANT ALL ON public.mkt_leads TO service_role;
ALTER TABLE public.mkt_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Membros gerenciam leads" ON public.mkt_leads;
CREATE POLICY "Membros gerenciam leads" ON public.mkt_leads FOR ALL TO authenticated
  USING (public.is_member(auth.uid(), clinica_id)) WITH CHECK (public.is_member(auth.uid(), clinica_id));
DROP POLICY IF EXISTS "Qualquer um pode capturar lead" ON public.mkt_leads;
CREATE POLICY "Qualquer um pode capturar lead" ON public.mkt_leads FOR INSERT TO anon
  WITH CHECK (landing_page_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.mkt_landing_pages p
    WHERE p.id = landing_page_id AND p.clinica_id = mkt_leads.clinica_id AND p.status = 'publicada'
  ));

CREATE TABLE IF NOT EXISTS public.lgpd_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid,
  tipo text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'pendente',
  resposta text,
  respondido_em timestamptz,
  respondido_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lgpd_sol_clinica ON public.lgpd_solicitacoes(clinica_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lgpd_solicitacoes TO authenticated;
GRANT ALL ON public.lgpd_solicitacoes TO service_role;
ALTER TABLE public.lgpd_solicitacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "membros leem solicitacoes lgpd" ON public.lgpd_solicitacoes;
CREATE POLICY "membros leem solicitacoes lgpd" ON public.lgpd_solicitacoes FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));
DROP POLICY IF EXISTS "membros criam solicitacoes lgpd" ON public.lgpd_solicitacoes;
CREATE POLICY "membros criam solicitacoes lgpd" ON public.lgpd_solicitacoes FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), clinica_id));
DROP POLICY IF EXISTS "gestores respondem solicitacoes lgpd" ON public.lgpd_solicitacoes;
CREATE POLICY "gestores respondem solicitacoes lgpd" ON public.lgpd_solicitacoes FOR UPDATE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));
DROP POLICY IF EXISTS "gestores removem solicitacoes lgpd" ON public.lgpd_solicitacoes;
CREATE POLICY "gestores removem solicitacoes lgpd" ON public.lgpd_solicitacoes FOR DELETE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

ALTER TABLE public.contratos_assinatura
  ADD COLUMN IF NOT EXISTS plano_id uuid REFERENCES public.planos_assinatura(id) ON DELETE RESTRICT;