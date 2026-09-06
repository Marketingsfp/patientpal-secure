ALTER TABLE public.nina_feedback_erros
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual';

ALTER TABLE public.nina_feedback_erros
  DROP CONSTRAINT IF EXISTS nina_fb_origem_chk;
ALTER TABLE public.nina_feedback_erros
  ADD CONSTRAINT nina_fb_origem_chk
  CHECK (origem IN ('manual', 'nina_message_quick_report'));

-- Correção deixa de ser obrigatória apenas no reporte rápido.
ALTER TABLE public.nina_feedback_erros ALTER COLUMN correcao DROP NOT NULL;
ALTER TABLE public.nina_feedback_erros
  DROP CONSTRAINT IF EXISTS nina_fb_correcao_chk;
ALTER TABLE public.nina_feedback_erros
  ADD CONSTRAINT nina_fb_correcao_chk
  CHECK (
    origem = 'nina_message_quick_report'
    OR (correcao IS NOT NULL AND length(btrim(correcao)) > 0)
  );

-- Classificação neutra "Erro reportado — a classificar".
ALTER TABLE public.nina_feedback_erros DROP CONSTRAINT IF EXISTS nina_fb_categoria_chk;
ALTER TABLE public.nina_feedback_erros
  ADD CONSTRAINT nina_fb_categoria_chk CHECK (categoria = ANY (ARRAY[
    'valor_incorreto','medico_incorreto','unidade_incorreta','horario_incorreto',
    'procedimento_incorreto','preparo_incorreto','informacao_inexistente',
    'informacao_inventada','informacao_nao_encontrada','handoff_deveria_ocorrer',
    'handoff_desnecessario','resposta_incompleta','interpretacao_incorreta',
    'nao_classificado','outro'
  ]));

-- Anti-duplicidade no banco: 1 reporte rápido pendente por mensagem.
CREATE UNIQUE INDEX IF NOT EXISTS ux_nina_fb_quick_pendente
  ON public.nina_feedback_erros (mensagem_id)
  WHERE origem = 'nina_message_quick_report'
    AND status = 'pending'
    AND mensagem_id IS NOT NULL;