-- 1) Novos campos em procedimentos
ALTER TABLE public.procedimentos
  ADD COLUMN IF NOT EXISTS grupo text,
  ADD COLUMN IF NOT EXISTS valor_dinheiro_pix numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_cartao numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_cartao_consulta numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_cartao_desconto numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_procedimentos_grupo ON public.procedimentos(clinica_id, grupo);

-- 2) Cartões de convênio
CREATE TABLE IF NOT EXISTS public.cartoes_convenio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  percentual_desconto numeric NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cartoes_convenio ENABLE ROW LEVEL SECURITY;

CREATE POLICY cc_select ON public.cartoes_convenio
  FOR SELECT TO authenticated
  USING (is_member(auth.uid(), clinica_id));

CREATE POLICY cc_insert ON public.cartoes_convenio
  FOR INSERT TO authenticated
  WITH CHECK (is_member(auth.uid(), clinica_id));

CREATE POLICY cc_update ON public.cartoes_convenio
  FOR UPDATE TO authenticated
  USING (is_member(auth.uid(), clinica_id));

CREATE POLICY cc_delete ON public.cartoes_convenio
  FOR DELETE TO authenticated
  USING (can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_cc_touch
  BEFORE UPDATE ON public.cartoes_convenio
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();