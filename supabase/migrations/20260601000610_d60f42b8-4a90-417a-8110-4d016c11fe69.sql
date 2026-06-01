
-- Tabela de solicitações de estorno
CREATE TABLE public.estorno_solicitacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  lancamento_id UUID,
  agendamento_id UUID,
  paciente_nome TEXT,
  descricao TEXT,
  valor NUMERIC(12,2),
  motivo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  solicitado_por UUID NOT NULL,
  solicitado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolvido_por UUID,
  resolvido_em TIMESTAMPTZ,
  resposta TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT estorno_status_chk CHECK (status IN ('pendente','aprovado','rejeitado','cancelado')),
  CONSTRAINT estorno_motivo_len CHECK (length(motivo) >= 5 AND length(motivo) <= 1000)
);

CREATE INDEX idx_estorno_clinica_status ON public.estorno_solicitacoes (clinica_id, status);
CREATE INDEX idx_estorno_lancamento ON public.estorno_solicitacoes (lancamento_id);

GRANT SELECT, INSERT, UPDATE ON public.estorno_solicitacoes TO authenticated;
GRANT ALL ON public.estorno_solicitacoes TO service_role;

ALTER TABLE public.estorno_solicitacoes ENABLE ROW LEVEL SECURITY;

-- Membros da clínica podem ver as solicitações da clínica
CREATE POLICY "estorno_select_membros"
ON public.estorno_solicitacoes
FOR SELECT
TO authenticated
USING (public.is_member(auth.uid(), clinica_id));

-- Qualquer membro pode criar (recepção/caixa solicitam)
CREATE POLICY "estorno_insert_membros"
ON public.estorno_solicitacoes
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(auth.uid(), clinica_id)
  AND solicitado_por = auth.uid()
  AND status = 'pendente'
);

-- Solicitante pode cancelar enquanto pendente
CREATE POLICY "estorno_update_solicitante_cancela"
ON public.estorno_solicitacoes
FOR UPDATE
TO authenticated
USING (
  solicitado_por = auth.uid() AND status = 'pendente'
)
WITH CHECK (
  solicitado_por = auth.uid() AND status IN ('pendente','cancelado')
);

-- Financeiro/admin/gestor aprova ou rejeita
CREATE POLICY "estorno_update_financeiro"
ON public.estorno_solicitacoes
FOR UPDATE
TO authenticated
USING (
  public.can_manage_clinica(auth.uid(), clinica_id)
  OR public.has_role(auth.uid(), clinica_id, 'financeiro'::app_role)
)
WITH CHECK (
  public.can_manage_clinica(auth.uid(), clinica_id)
  OR public.has_role(auth.uid(), clinica_id, 'financeiro'::app_role)
);

CREATE TRIGGER trg_estorno_solicitacoes_updated_at
BEFORE UPDATE ON public.estorno_solicitacoes
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.estorno_solicitacoes;
ALTER TABLE public.estorno_solicitacoes REPLICA IDENTITY FULL;
