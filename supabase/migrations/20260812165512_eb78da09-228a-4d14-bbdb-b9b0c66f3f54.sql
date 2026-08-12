ALTER TABLE public.estoque_produtos
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'insumos',
  ADD COLUMN IF NOT EXISTS fornecedor text;

CREATE TABLE IF NOT EXISTS public.estoque_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  produto_id uuid NOT NULL REFERENCES public.estoque_produtos(id) ON DELETE CASCADE,
  lote text,
  validade date,
  quantidade numeric NOT NULL DEFAULT 0,
  quantidade_inicial numeric NOT NULL DEFAULT 0,
  custo_unitario numeric NOT NULL DEFAULT 0,
  fornecedor text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estoque_lotes_produto ON public.estoque_lotes(produto_id, validade);
CREATE INDEX IF NOT EXISTS idx_estoque_lotes_clinica ON public.estoque_lotes(clinica_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_lotes TO authenticated;
GRANT ALL ON public.estoque_lotes TO service_role;

ALTER TABLE public.estoque_lotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY el_select ON public.estoque_lotes FOR SELECT TO authenticated
  USING (is_member(auth.uid(), clinica_id));
CREATE POLICY el_insert ON public.estoque_lotes FOR INSERT TO authenticated
  WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY el_update ON public.estoque_lotes FOR UPDATE TO authenticated
  USING (is_member(auth.uid(), clinica_id)) WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY el_delete ON public.estoque_lotes FOR DELETE TO authenticated
  USING (can_manage_clinica(auth.uid(), clinica_id));

DROP TRIGGER IF EXISTS trg_estoque_lotes_updated ON public.estoque_lotes;
CREATE TRIGGER trg_estoque_lotes_updated BEFORE UPDATE ON public.estoque_lotes
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

ALTER TABLE public.estoque_movimentos
  ADD COLUMN IF NOT EXISTS lote_id uuid REFERENCES public.estoque_lotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo text;