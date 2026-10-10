-- Pesquisa de satisfação do atendimento humano no OS ZAP.

ALTER TABLE public.atend_avaliacoes
  ADD COLUMN IF NOT EXISTS atendente_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS solicitada_por_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS solicitada_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS respondida_em timestamptz,
  ADD COLUMN IF NOT EXISTS solicitacao_wa_message_id text,
  ADD COLUMN IF NOT EXISTS resposta_wa_message_id text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'respondida',
  ADD COLUMN IF NOT EXISTS falha_envio text;

UPDATE public.atend_avaliacoes
SET solicitada_em = created_at,
    respondida_em = COALESCE(respondida_em, created_at),
    status = 'respondida'
WHERE nota IS NOT NULL;

ALTER TABLE public.atend_avaliacoes
  ALTER COLUMN nota DROP NOT NULL;

ALTER TABLE public.atend_avaliacoes
  DROP CONSTRAINT IF EXISTS atend_avaliacoes_nota_check,
  DROP CONSTRAINT IF EXISTS atend_avaliacoes_status_check,
  DROP CONSTRAINT IF EXISTS atend_avaliacoes_estado_check;

ALTER TABLE public.atend_avaliacoes
  ADD CONSTRAINT atend_avaliacoes_status_check
    CHECK (status IN ('pendente', 'respondida', 'falha_envio', 'expirada')),
  ADD CONSTRAINT atend_avaliacoes_estado_check
    CHECK (
      (status = 'respondida' AND nota BETWEEN 1 AND 5 AND respondida_em IS NOT NULL)
      OR (status <> 'respondida' AND nota IS NULL AND respondida_em IS NULL)
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_atend_avaliacoes_uma_pendente
  ON public.atend_avaliacoes (conversa_id)
  WHERE status = 'pendente';

CREATE UNIQUE INDEX IF NOT EXISTS idx_atend_avaliacoes_resposta_wa
  ON public.atend_avaliacoes (resposta_wa_message_id)
  WHERE resposta_wa_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atend_avaliacoes_atendente_periodo
  ON public.atend_avaliacoes (
    clinica_id,
    atendente_user_id,
    respondida_em DESC
  )
  WHERE status = 'respondida';

DROP POLICY IF EXISTS "av_all" ON public.atend_avaliacoes;
DROP POLICY IF EXISTS "av_select" ON public.atend_avaliacoes;

CREATE POLICY "av_select" ON public.atend_avaliacoes
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

REVOKE INSERT, UPDATE, DELETE
  ON public.atend_avaliacoes
  FROM authenticated;

GRANT SELECT
  ON public.atend_avaliacoes
  TO authenticated;

COMMENT ON COLUMN public.atend_avaliacoes.atendente_user_id IS
  'Atendente responsável pela conversa no encerramento e a quem a nota é atribuída.';

COMMENT ON COLUMN public.atend_avaliacoes.solicitada_por_user_id IS
  'Usuário que clicou para encerrar; pode ser supervisão e ser diferente da atendente avaliada.';

COMMENT ON COLUMN public.atend_avaliacoes.status IS
  'Ciclo da pesquisa: pendente, respondida, falha_envio ou expirada.';