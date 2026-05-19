
CREATE TYPE caixa_sessao_status AS ENUM ('aberto', 'fechado');
CREATE TYPE caixa_mov_tipo AS ENUM ('abertura', 'sangria', 'suprimento', 'recebimento', 'despesa', 'fechamento');

CREATE TABLE public.caixa_sessoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id uuid NOT NULL,
  user_id uuid NOT NULL,
  user_nome text,
  aberto_em timestamptz NOT NULL DEFAULT now(),
  valor_abertura numeric NOT NULL DEFAULT 0,
  fechado_em timestamptz,
  valor_fechamento_informado numeric,
  valor_fechamento_calculado numeric,
  diferenca numeric,
  status caixa_sessao_status NOT NULL DEFAULT 'aberto',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_caixa_sessoes_clinica ON public.caixa_sessoes(clinica_id, status);
CREATE INDEX idx_caixa_sessoes_user ON public.caixa_sessoes(user_id, status);

CREATE TABLE public.caixa_movimentos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sessao_id uuid NOT NULL REFERENCES public.caixa_sessoes(id) ON DELETE CASCADE,
  clinica_id uuid NOT NULL,
  user_id uuid NOT NULL,
  tipo caixa_mov_tipo NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  descricao text,
  forma_pagamento text,
  lancamento_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_caixa_movimentos_sessao ON public.caixa_movimentos(sessao_id);
CREATE INDEX idx_caixa_movimentos_clinica ON public.caixa_movimentos(clinica_id);

ALTER TABLE public.caixa_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixa_movimentos ENABLE ROW LEVEL SECURITY;

-- Sessoes: usuario ve as suas; gestor ve todas da clinica
CREATE POLICY cx_sess_select ON public.caixa_sessoes FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid() AND is_member(auth.uid(), clinica_id))
    OR can_manage_clinica(auth.uid(), clinica_id)
  );
CREATE POLICY cx_sess_insert ON public.caixa_sessoes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_member(auth.uid(), clinica_id));
CREATE POLICY cx_sess_update ON public.caixa_sessoes FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND is_member(auth.uid(), clinica_id))
    OR can_manage_clinica(auth.uid(), clinica_id)
  );
CREATE POLICY cx_sess_delete ON public.caixa_sessoes FOR DELETE TO authenticated
  USING (can_manage_clinica(auth.uid(), clinica_id));

-- Movimentos: usuario ve os seus; gestor ve todos da clinica
CREATE POLICY cx_mov_select ON public.caixa_movimentos FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid() AND is_member(auth.uid(), clinica_id))
    OR can_manage_clinica(auth.uid(), clinica_id)
  );
CREATE POLICY cx_mov_insert ON public.caixa_movimentos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_member(auth.uid(), clinica_id));
CREATE POLICY cx_mov_update ON public.caixa_movimentos FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND is_member(auth.uid(), clinica_id))
    OR can_manage_clinica(auth.uid(), clinica_id)
  );
CREATE POLICY cx_mov_delete ON public.caixa_movimentos FOR DELETE TO authenticated
  USING (can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER caixa_sessoes_touch BEFORE UPDATE ON public.caixa_sessoes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
