CREATE TABLE public.nina_cat_servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  procedimento_id uuid REFERENCES public.procedimentos(id) ON DELETE SET NULL,
  nome text NOT NULL,
  valor numeric(12,2),
  valor_observacao text,
  descricao_publica text,
  preparo text,
  restricoes text,
  nota_interna text,
  executantes jsonb NOT NULL DEFAULT '[]'::jsonb,
  formas_pagamento jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'RASCUNHO',
  rascunho jsonb,
  publicado_em timestamptz,
  publicado_por uuid,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_cat_servicos_status_chk CHECK (status IN ('RASCUNHO','PUBLICADO','ARQUIVADO')),
  CONSTRAINT nina_cat_servicos_nome_chk CHECK (btrim(nome) <> ''),
  CONSTRAINT nina_cat_servicos_valor_chk CHECK (valor IS NULL OR valor >= 0)
);

CREATE INDEX idx_nina_cat_servicos_clinica ON public.nina_cat_servicos (clinica_id, status);
CREATE INDEX idx_nina_cat_servicos_nome_trgm ON public.nina_cat_servicos USING gin (lower(nome) gin_trgm_ops);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nina_cat_servicos TO authenticated;
GRANT ALL ON public.nina_cat_servicos TO service_role;
ALTER TABLE public.nina_cat_servicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cat_servicos_select_membros" ON public.nina_cat_servicos
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clinica_memberships m
                 WHERE m.clinica_id = nina_cat_servicos.clinica_id AND m.user_id = auth.uid() AND m.ativo));

CREATE POLICY "cat_servicos_write_admin" ON public.nina_cat_servicos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clinica_memberships m
                 WHERE m.clinica_id = nina_cat_servicos.clinica_id AND m.user_id = auth.uid()
                   AND m.ativo AND m.role IN ('admin','gestor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clinica_memberships m
                      WHERE m.clinica_id = nina_cat_servicos.clinica_id AND m.user_id = auth.uid()
                        AND m.ativo AND m.role IN ('admin','gestor')));

CREATE TABLE public.nina_cat_profissionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  medico_id uuid REFERENCES public.medicos(id) ON DELETE SET NULL,
  unidade_id uuid REFERENCES public.unidades(id) ON DELETE SET NULL,
  nome text NOT NULL,
  especialidades jsonb NOT NULL DEFAULT '[]'::jsonb,
  atende_consultorio boolean,
  formas_pagamento jsonb NOT NULL DEFAULT '[]'::jsonb,
  convenios jsonb NOT NULL DEFAULT '[]'::jsonb,
  horarios jsonb NOT NULL DEFAULT '[]'::jsonb,
  tipo_atendimento text,
  observacao_publica text,
  aviso_dia text,
  aviso_valido_de date,
  aviso_valido_ate date,
  nota_interna text,
  status text NOT NULL DEFAULT 'RASCUNHO',
  rascunho jsonb,
  publicado_em timestamptz,
  publicado_por uuid,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_cat_prof_status_chk CHECK (status IN ('RASCUNHO','PUBLICADO','ARQUIVADO')),
  CONSTRAINT nina_cat_prof_nome_chk CHECK (btrim(nome) <> ''),
  CONSTRAINT nina_cat_prof_aviso_periodo_chk CHECK (
    aviso_valido_de IS NULL OR aviso_valido_ate IS NULL OR aviso_valido_ate >= aviso_valido_de
  )
);

CREATE INDEX idx_nina_cat_prof_clinica ON public.nina_cat_profissionais (clinica_id, status);
CREATE INDEX idx_nina_cat_prof_nome_trgm ON public.nina_cat_profissionais USING gin (lower(nome) gin_trgm_ops);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nina_cat_profissionais TO authenticated;
GRANT ALL ON public.nina_cat_profissionais TO service_role;
ALTER TABLE public.nina_cat_profissionais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cat_prof_select_membros" ON public.nina_cat_profissionais
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clinica_memberships m
                 WHERE m.clinica_id = nina_cat_profissionais.clinica_id AND m.user_id = auth.uid() AND m.ativo));

CREATE POLICY "cat_prof_write_admin" ON public.nina_cat_profissionais
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clinica_memberships m
                 WHERE m.clinica_id = nina_cat_profissionais.clinica_id AND m.user_id = auth.uid()
                   AND m.ativo AND m.role IN ('admin','gestor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clinica_memberships m
                      WHERE m.clinica_id = nina_cat_profissionais.clinica_id AND m.user_id = auth.uid()
                        AND m.ativo AND m.role IN ('admin','gestor')));

CREATE TRIGGER trg_nina_cat_servicos_updated
  BEFORE UPDATE ON public.nina_cat_servicos
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE TRIGGER trg_nina_cat_prof_updated
  BEFORE UPDATE ON public.nina_cat_profissionais
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();