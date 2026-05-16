
-- Tipos
DO $$ BEGIN CREATE TYPE public.fin_tipo_lancamento AS ENUM ('receita','despesa'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.fin_status_lancamento AS ENUM ('pendente','confirmado','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.fin_tipo_conta AS ENUM ('caixa','banco','cartao','maquininha','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CATEGORIAS
CREATE TABLE IF NOT EXISTS public.fin_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#13b5a3',
  tipo public.fin_tipo_lancamento NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_categorias_clinica ON public.fin_categorias(clinica_id);
ALTER TABLE public.fin_categorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_cat_select ON public.fin_categorias;
DROP POLICY IF EXISTS fin_cat_insert ON public.fin_categorias;
DROP POLICY IF EXISTS fin_cat_update ON public.fin_categorias;
DROP POLICY IF EXISTS fin_cat_delete ON public.fin_categorias;
CREATE POLICY fin_cat_select ON public.fin_categorias FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_cat_insert ON public.fin_categorias FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_cat_update ON public.fin_categorias FOR UPDATE TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_cat_delete ON public.fin_categorias FOR DELETE TO authenticated USING (public.can_manage_clinica(auth.uid(), clinica_id));
DROP TRIGGER IF EXISTS fin_cat_touch ON public.fin_categorias;
CREATE TRIGGER fin_cat_touch BEFORE UPDATE ON public.fin_categorias FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- CONTAS
CREATE TABLE IF NOT EXISTS public.fin_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  nome text NOT NULL,
  tipo public.fin_tipo_conta NOT NULL DEFAULT 'banco',
  saldo_inicial numeric(14,2) NOT NULL DEFAULT 0,
  banco text, agencia text, conta text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_contas_clinica ON public.fin_contas(clinica_id);
ALTER TABLE public.fin_contas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_contas_select ON public.fin_contas;
DROP POLICY IF EXISTS fin_contas_insert ON public.fin_contas;
DROP POLICY IF EXISTS fin_contas_update ON public.fin_contas;
DROP POLICY IF EXISTS fin_contas_delete ON public.fin_contas;
CREATE POLICY fin_contas_select ON public.fin_contas FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_contas_insert ON public.fin_contas FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_contas_update ON public.fin_contas FOR UPDATE TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_contas_delete ON public.fin_contas FOR DELETE TO authenticated USING (public.can_manage_clinica(auth.uid(), clinica_id));
DROP TRIGGER IF EXISTS fin_contas_touch ON public.fin_contas;
CREATE TRIGGER fin_contas_touch BEFORE UPDATE ON public.fin_contas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- EMPRESAS
CREATE TABLE IF NOT EXISTS public.fin_empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  nome text NOT NULL,
  cnpj text, telefone text, email text, observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_empresas_clinica ON public.fin_empresas(clinica_id);
ALTER TABLE public.fin_empresas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_emp_select ON public.fin_empresas;
DROP POLICY IF EXISTS fin_emp_insert ON public.fin_empresas;
DROP POLICY IF EXISTS fin_emp_update ON public.fin_empresas;
DROP POLICY IF EXISTS fin_emp_delete ON public.fin_empresas;
CREATE POLICY fin_emp_select ON public.fin_empresas FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_emp_insert ON public.fin_empresas FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_emp_update ON public.fin_empresas FOR UPDATE TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_emp_delete ON public.fin_empresas FOR DELETE TO authenticated USING (public.can_manage_clinica(auth.uid(), clinica_id));
DROP TRIGGER IF EXISTS fin_emp_touch ON public.fin_empresas;
CREATE TRIGGER fin_emp_touch BEFORE UPDATE ON public.fin_empresas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- LANÇAMENTOS
CREATE TABLE IF NOT EXISTS public.fin_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  tipo public.fin_tipo_lancamento NOT NULL,
  descricao text NOT NULL,
  valor numeric(14,2) NOT NULL CHECK (valor >= 0),
  data date NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento date,
  status public.fin_status_lancamento NOT NULL DEFAULT 'confirmado',
  categoria_id uuid REFERENCES public.fin_categorias(id) ON DELETE SET NULL,
  conta_id uuid REFERENCES public.fin_contas(id) ON DELETE SET NULL,
  empresa_id uuid REFERENCES public.fin_empresas(id) ON DELETE SET NULL,
  paciente_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  medico_id uuid REFERENCES public.medicos(id) ON DELETE SET NULL,
  forma_pagamento text,
  observacoes text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_clinica_data ON public.fin_lancamentos(clinica_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_tipo ON public.fin_lancamentos(clinica_id, tipo);
ALTER TABLE public.fin_lancamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_lanc_select ON public.fin_lancamentos;
DROP POLICY IF EXISTS fin_lanc_insert ON public.fin_lancamentos;
DROP POLICY IF EXISTS fin_lanc_update ON public.fin_lancamentos;
DROP POLICY IF EXISTS fin_lanc_delete ON public.fin_lancamentos;
CREATE POLICY fin_lanc_select ON public.fin_lancamentos FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_lanc_insert ON public.fin_lancamentos FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_lanc_update ON public.fin_lancamentos FOR UPDATE TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_lanc_delete ON public.fin_lancamentos FOR DELETE TO authenticated USING (public.can_manage_clinica(auth.uid(), clinica_id));
DROP TRIGGER IF EXISTS fin_lanc_touch ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_touch BEFORE UPDATE ON public.fin_lancamentos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- NOTAS PACIENTES
CREATE TABLE IF NOT EXISTS public.fin_notas_pacientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  paciente_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  lancamento_id uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,
  numero text, serie text,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  data_emissao date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'emitida',
  url_pdf text, observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_notas_clinica ON public.fin_notas_pacientes(clinica_id);
ALTER TABLE public.fin_notas_pacientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_notas_select ON public.fin_notas_pacientes;
DROP POLICY IF EXISTS fin_notas_insert ON public.fin_notas_pacientes;
DROP POLICY IF EXISTS fin_notas_update ON public.fin_notas_pacientes;
DROP POLICY IF EXISTS fin_notas_delete ON public.fin_notas_pacientes;
CREATE POLICY fin_notas_select ON public.fin_notas_pacientes FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_notas_insert ON public.fin_notas_pacientes FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_notas_update ON public.fin_notas_pacientes FOR UPDATE TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_notas_delete ON public.fin_notas_pacientes FOR DELETE TO authenticated USING (public.can_manage_clinica(auth.uid(), clinica_id));
DROP TRIGGER IF EXISTS fin_notas_touch ON public.fin_notas_pacientes;
CREATE TRIGGER fin_notas_touch BEFORE UPDATE ON public.fin_notas_pacientes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ATENDIMENTOS FINANCEIROS
CREATE TABLE IF NOT EXISTS public.fin_atendimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  paciente_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  medico_id uuid REFERENCES public.medicos(id) ON DELETE SET NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  procedimento text,
  valor_total numeric(14,2) NOT NULL DEFAULT 0,
  valor_medico numeric(14,2) NOT NULL DEFAULT 0,
  valor_clinica numeric(14,2) NOT NULL DEFAULT 0,
  forma_pagamento text,
  lancamento_id uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'realizado',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_atend_clinica_data ON public.fin_atendimentos(clinica_id, data DESC);
ALTER TABLE public.fin_atendimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_atend_select ON public.fin_atendimentos;
DROP POLICY IF EXISTS fin_atend_insert ON public.fin_atendimentos;
DROP POLICY IF EXISTS fin_atend_update ON public.fin_atendimentos;
DROP POLICY IF EXISTS fin_atend_delete ON public.fin_atendimentos;
CREATE POLICY fin_atend_select ON public.fin_atendimentos FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_atend_insert ON public.fin_atendimentos FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_atend_update ON public.fin_atendimentos FOR UPDATE TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_atend_delete ON public.fin_atendimentos FOR DELETE TO authenticated USING (public.can_manage_clinica(auth.uid(), clinica_id));
DROP TRIGGER IF EXISTS fin_atend_touch ON public.fin_atendimentos;
CREATE TRIGGER fin_atend_touch BEFORE UPDATE ON public.fin_atendimentos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- LEMBRETES
CREATE TABLE IF NOT EXISTS public.fin_lembretes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  titulo text NOT NULL, descricao text,
  data_lembrete date NOT NULL,
  concluido boolean NOT NULL DEFAULT false,
  prioridade text NOT NULL DEFAULT 'media',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_lemb_clinica ON public.fin_lembretes(clinica_id, data_lembrete);
ALTER TABLE public.fin_lembretes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_lemb_select ON public.fin_lembretes;
DROP POLICY IF EXISTS fin_lemb_insert ON public.fin_lembretes;
DROP POLICY IF EXISTS fin_lemb_update ON public.fin_lembretes;
DROP POLICY IF EXISTS fin_lemb_delete ON public.fin_lembretes;
CREATE POLICY fin_lemb_select ON public.fin_lembretes FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_lemb_insert ON public.fin_lembretes FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_lemb_update ON public.fin_lembretes FOR UPDATE TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_lemb_delete ON public.fin_lembretes FOR DELETE TO authenticated USING (public.is_member(auth.uid(), clinica_id));
DROP TRIGGER IF EXISTS fin_lemb_touch ON public.fin_lembretes;
CREATE TRIGGER fin_lemb_touch BEFORE UPDATE ON public.fin_lembretes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ALERTAS
CREATE TABLE IF NOT EXISTS public.fin_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  tipo_alerta text NOT NULL,
  mensagem text NOT NULL,
  data_alerta date NOT NULL DEFAULT CURRENT_DATE,
  lancamento_id uuid REFERENCES public.fin_lancamentos(id) ON DELETE CASCADE,
  lido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_alertas_clinica ON public.fin_alertas(clinica_id, lido);
ALTER TABLE public.fin_alertas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_al_select ON public.fin_alertas;
DROP POLICY IF EXISTS fin_al_insert ON public.fin_alertas;
DROP POLICY IF EXISTS fin_al_update ON public.fin_alertas;
DROP POLICY IF EXISTS fin_al_delete ON public.fin_alertas;
CREATE POLICY fin_al_select ON public.fin_alertas FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_al_insert ON public.fin_alertas FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_al_update ON public.fin_alertas FOR UPDATE TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_al_delete ON public.fin_alertas FOR DELETE TO authenticated USING (public.can_manage_clinica(auth.uid(), clinica_id));

-- REGRAS IA
CREATE TABLE IF NOT EXISTS public.fin_regras_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  nome text NOT NULL,
  padrao_descricao text,
  categoria_id uuid REFERENCES public.fin_categorias(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  prioridade integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_regras_clinica ON public.fin_regras_ia(clinica_id);
ALTER TABLE public.fin_regras_ia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_reg_select ON public.fin_regras_ia;
DROP POLICY IF EXISTS fin_reg_insert ON public.fin_regras_ia;
DROP POLICY IF EXISTS fin_reg_update ON public.fin_regras_ia;
DROP POLICY IF EXISTS fin_reg_delete ON public.fin_regras_ia;
CREATE POLICY fin_reg_select ON public.fin_regras_ia FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY fin_reg_insert ON public.fin_regras_ia FOR INSERT TO authenticated WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY fin_reg_update ON public.fin_regras_ia FOR UPDATE TO authenticated USING (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY fin_reg_delete ON public.fin_regras_ia FOR DELETE TO authenticated USING (public.can_manage_clinica(auth.uid(), clinica_id));
DROP TRIGGER IF EXISTS fin_reg_touch ON public.fin_regras_ia;
CREATE TRIGGER fin_reg_touch BEFORE UPDATE ON public.fin_regras_ia FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- SEED: categorias padrão por clínica
INSERT INTO public.fin_categorias (clinica_id, nome, cor, tipo)
SELECT c.id, s.nome, s.cor, s.tipo::public.fin_tipo_lancamento
FROM public.clinicas c
CROSS JOIN (VALUES
  ('Consultas','#22C55E','receita'),
  ('Procedimentos','#10B981','receita'),
  ('Convênios','#059669','receita'),
  ('Particular','#16A34A','receita'),
  ('Repasse Médico','#EF4444','despesa'),
  ('Aluguel','#DC2626','despesa'),
  ('Salários','#F97316','despesa'),
  ('Materiais','#F59E0B','despesa'),
  ('Marketing','#8B5CF6','despesa'),
  ('Impostos','#EC4899','despesa'),
  ('Outros','#94A3B8','despesa')
) AS s(nome, cor, tipo)
WHERE NOT EXISTS (
  SELECT 1 FROM public.fin_categorias x WHERE x.clinica_id = c.id AND x.nome = s.nome
);

-- SEED: conta caixa padrão por clínica
INSERT INTO public.fin_contas (clinica_id, nome, tipo)
SELECT c.id, 'Caixa', 'caixa'::public.fin_tipo_conta
FROM public.clinicas c
WHERE NOT EXISTS (SELECT 1 FROM public.fin_contas x WHERE x.clinica_id = c.id AND x.nome = 'Caixa');
