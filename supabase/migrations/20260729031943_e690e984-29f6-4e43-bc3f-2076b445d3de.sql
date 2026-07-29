CREATE OR REPLACE FUNCTION public.is_admin_ou_gestor(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinica_memberships
    WHERE user_id = _user_id AND ativo = true AND role IN ('admin','gestor')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_global(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinica_memberships
    WHERE user_id = _user_id AND ativo = true AND role = 'admin'
  )
$$;

CREATE TABLE public.dev_relatorio_entradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  hora time NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::time,
  titulo text NOT NULL,
  descricao text,
  area text,
  tipo text NOT NULL DEFAULT 'ajuste',
  chave_loop text,
  loop_manual boolean NOT NULL DEFAULT false,
  loop_motivo text,
  origem text NOT NULL DEFAULT 'manual',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dev_rel_entradas_data ON public.dev_relatorio_entradas (data DESC);
CREATE INDEX idx_dev_rel_entradas_chave ON public.dev_relatorio_entradas (chave_loop) WHERE chave_loop IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_relatorio_entradas TO authenticated;
GRANT ALL ON public.dev_relatorio_entradas TO service_role;
ALTER TABLE public.dev_relatorio_entradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_rel_entradas_select" ON public.dev_relatorio_entradas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "dev_rel_entradas_insert" ON public.dev_relatorio_entradas
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_ou_gestor(auth.uid()));
CREATE POLICY "dev_rel_entradas_update" ON public.dev_relatorio_entradas
  FOR UPDATE TO authenticated USING (public.is_admin_ou_gestor(auth.uid()));
CREATE POLICY "dev_rel_entradas_delete" ON public.dev_relatorio_entradas
  FOR DELETE TO authenticated USING (public.is_admin_global(auth.uid()));

CREATE TRIGGER trg_dev_rel_entradas_touch
  BEFORE UPDATE ON public.dev_relatorio_entradas
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE TABLE public.dev_relatorio_destinatarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_relatorio_destinatarios TO authenticated;
GRANT ALL ON public.dev_relatorio_destinatarios TO service_role;
ALTER TABLE public.dev_relatorio_destinatarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_rel_dest_select" ON public.dev_relatorio_destinatarios
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "dev_rel_dest_write" ON public.dev_relatorio_destinatarios
  FOR ALL TO authenticated
  USING (public.is_admin_ou_gestor(auth.uid()))
  WITH CHECK (public.is_admin_ou_gestor(auth.uid()));

CREATE TABLE public.dev_relatorio_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  destinatarios int NOT NULL DEFAULT 0,
  mensagem text,
  erro text,
  enviado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dev_rel_envios_data ON public.dev_relatorio_envios (data DESC);
GRANT SELECT ON public.dev_relatorio_envios TO authenticated;
GRANT ALL ON public.dev_relatorio_envios TO service_role;
ALTER TABLE public.dev_relatorio_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_rel_envios_select" ON public.dev_relatorio_envios
  FOR SELECT TO authenticated USING (true);