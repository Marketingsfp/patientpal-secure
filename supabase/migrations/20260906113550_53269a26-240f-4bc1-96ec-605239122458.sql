-- 1) Mensagem -> execução que a produziu
ALTER TABLE public.whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS execucao_id uuid REFERENCES public.nina_execucoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_execucao
  ON public.whatsapp_mensagens (execucao_id)
  WHERE execucao_id IS NOT NULL;

-- 2) Erro reportado -> execução de origem + estado real da auditoria
ALTER TABLE public.nina_feedback_erros
  ADD COLUMN IF NOT EXISTS execucao_id uuid REFERENCES public.nina_execucoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auditoria_status text;

ALTER TABLE public.nina_feedback_erros
  DROP CONSTRAINT IF EXISTS nina_feedback_erros_auditoria_status_chk;

ALTER TABLE public.nina_feedback_erros
  ADD CONSTRAINT nina_feedback_erros_auditoria_status_chk
  CHECK (auditoria_status IS NULL OR auditoria_status = ANY (ARRAY['processing'::text,'available'::text,'partial'::text,'unavailable'::text]));

CREATE INDEX IF NOT EXISTS idx_nina_feedback_erros_execucao
  ON public.nina_feedback_erros (execucao_id)
  WHERE execucao_id IS NOT NULL;

-- 3) Retenção de 30 dias das evidências técnicas, preservando o que está
--    vinculado a um erro reportado (o vínculo nunca fica "vazio").
CREATE OR REPLACE FUNCTION public.nina_execucoes_expurgo(_dias integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removidos integer;
BEGIN
  WITH del AS (
    DELETE FROM public.nina_execucoes e
    WHERE e.created_at < now() - make_interval(days => GREATEST(_dias, 1))
      AND NOT EXISTS (
        SELECT 1 FROM public.nina_feedback_erros f WHERE f.execucao_id = e.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.whatsapp_mensagens m
        JOIN public.nina_feedback_erros f2 ON f2.mensagem_id = m.id
        WHERE m.execucao_id = e.id
      )
    RETURNING 1
  )
  SELECT count(*) INTO removidos FROM del;
  RETURN removidos;
END;
$$;

REVOKE ALL ON FUNCTION public.nina_execucoes_expurgo(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nina_execucoes_expurgo(integer) TO service_role;