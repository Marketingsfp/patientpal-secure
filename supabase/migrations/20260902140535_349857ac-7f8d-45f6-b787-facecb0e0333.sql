CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.nina_kb_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  titulo text NOT NULL DEFAULT 'TAP - TABELA DE ATENDIMENTOS E PREÇOS',
  arquivo_nome text NOT NULL,
  arquivo_tipo text,
  arquivo_tamanho bigint,
  storage_path text,
  arquivo_hash text,
  versao integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'ENVIANDO',
  registros_total integer NOT NULL DEFAULT 0,
  linhas_lidas integer NOT NULL DEFAULT 0,
  erros jsonb NOT NULL DEFAULT '[]'::jsonb,
  validacao jsonb NOT NULL DEFAULT '{}'::jsonb,
  enviado_por uuid,
  enviado_por_nome text,
  processado_em timestamptz,
  ativada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_kb_bases_status_chk CHECK (status IN ('ENVIANDO','PROCESSANDO','ATIVA','INATIVA','ERRO'))
);

CREATE INDEX idx_nina_kb_bases_clinica ON public.nina_kb_bases (clinica_id, status);
CREATE UNIQUE INDEX uniq_nina_kb_base_ativa ON public.nina_kb_bases (clinica_id) WHERE status = 'ATIVA';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nina_kb_bases TO authenticated;
GRANT ALL ON public.nina_kb_bases TO service_role;
ALTER TABLE public.nina_kb_bases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_bases_select_membros" ON public.nina_kb_bases
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clinica_memberships m
                 WHERE m.clinica_id = nina_kb_bases.clinica_id AND m.user_id = auth.uid() AND m.ativo));

CREATE POLICY "kb_bases_insert_admin" ON public.nina_kb_bases
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.clinica_memberships m
                      WHERE m.clinica_id = nina_kb_bases.clinica_id AND m.user_id = auth.uid()
                        AND m.ativo AND m.role IN ('admin','gestor')));

CREATE POLICY "kb_bases_update_admin" ON public.nina_kb_bases
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clinica_memberships m
                 WHERE m.clinica_id = nina_kb_bases.clinica_id AND m.user_id = auth.uid()
                   AND m.ativo AND m.role IN ('admin','gestor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clinica_memberships m
                      WHERE m.clinica_id = nina_kb_bases.clinica_id AND m.user_id = auth.uid()
                        AND m.ativo AND m.role IN ('admin','gestor')));

CREATE POLICY "kb_bases_delete_admin" ON public.nina_kb_bases
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clinica_memberships m
                 WHERE m.clinica_id = nina_kb_bases.clinica_id AND m.user_id = auth.uid()
                   AND m.ativo AND m.role IN ('admin','gestor')));

CREATE TABLE public.nina_kb_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id uuid NOT NULL REFERENCES public.nina_kb_bases(id) ON DELETE CASCADE,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  versao integer NOT NULL DEFAULT 1,
  secao text,
  categoria text,
  tipo text,
  procedimento text,
  medico text,
  dia text,
  horario text,
  preco_dinheiro numeric(12,2),
  preco_cartao numeric(12,2),
  observacoes text,
  preparo text,
  extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  bruto jsonb NOT NULL DEFAULT '{}'::jsonb,
  linha_origem integer,
  aba_origem text,
  texto_busca text NOT NULL DEFAULT '',
  embedding vector(768),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nina_kb_reg_base ON public.nina_kb_registros (base_id);
CREATE INDEX idx_nina_kb_reg_clinica ON public.nina_kb_registros (clinica_id);
CREATE INDEX idx_nina_kb_reg_busca_trgm ON public.nina_kb_registros USING gin (texto_busca gin_trgm_ops);
CREATE UNIQUE INDEX uniq_nina_kb_reg_linha ON public.nina_kb_registros (base_id, aba_origem, linha_origem, coalesce(procedimento,''), coalesce(medico,''), coalesce(dia,''), coalesce(horario,''));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nina_kb_registros TO authenticated;
GRANT ALL ON public.nina_kb_registros TO service_role;
ALTER TABLE public.nina_kb_registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_reg_select_membros" ON public.nina_kb_registros
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clinica_memberships m
                 WHERE m.clinica_id = nina_kb_registros.clinica_id AND m.user_id = auth.uid() AND m.ativo));

CREATE POLICY "kb_reg_write_admin" ON public.nina_kb_registros
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clinica_memberships m
                 WHERE m.clinica_id = nina_kb_registros.clinica_id AND m.user_id = auth.uid()
                   AND m.ativo AND m.role IN ('admin','gestor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clinica_memberships m
                      WHERE m.clinica_id = nina_kb_registros.clinica_id AND m.user_id = auth.uid()
                        AND m.ativo AND m.role IN ('admin','gestor')));

CREATE TABLE public.nina_kb_consultas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  base_id uuid REFERENCES public.nina_kb_bases(id) ON DELETE SET NULL,
  versao integer,
  canal text NOT NULL DEFAULT 'interno',
  pergunta text,
  intencao text,
  termos text[],
  encontrados jsonb NOT NULL DEFAULT '[]'::jsonb,
  registro_usado uuid,
  score numeric(6,3),
  resposta text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nina_kb_consultas_clinica ON public.nina_kb_consultas (clinica_id, created_at DESC);

GRANT SELECT, INSERT ON public.nina_kb_consultas TO authenticated;
GRANT ALL ON public.nina_kb_consultas TO service_role;
ALTER TABLE public.nina_kb_consultas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_log_select_admin" ON public.nina_kb_consultas
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clinica_memberships m
                 WHERE m.clinica_id = nina_kb_consultas.clinica_id AND m.user_id = auth.uid()
                   AND m.ativo AND m.role IN ('admin','gestor')));

CREATE POLICY "kb_log_insert_membros" ON public.nina_kb_consultas
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.clinica_memberships m
                      WHERE m.clinica_id = nina_kb_consultas.clinica_id AND m.user_id = auth.uid() AND m.ativo));

CREATE TRIGGER trg_nina_kb_bases_updated_at
  BEFORE UPDATE ON public.nina_kb_bases
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();