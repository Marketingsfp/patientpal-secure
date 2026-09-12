CREATE TABLE IF NOT EXISTS public.nina_correcao_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  feedback_id uuid NOT NULL REFERENCES public.nina_feedback_erros(id) ON DELETE CASCADE,
  analise_id uuid,
  pacote_hash text,
  pacote_revisao integer,
  proposta jsonb NOT NULL,
  proposta_assinatura text NOT NULL,
  ambiente text,
  escopo text,
  autorizado_por uuid NOT NULL,
  autorizado_em timestamptz NOT NULL DEFAULT now(),
  etapa text NOT NULL DEFAULT 'verificando',
  status text NOT NULL DEFAULT 'em_curso',
  passos jsonb NOT NULL DEFAULT '[]'::jsonb,
  resumo jsonb,
  erro text,
  acao_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_correcao_exec_status_chk CHECK (status IN ('em_curso','concluida','falhou')),
  CONSTRAINT nina_correcao_exec_etapa_chk CHECK (etapa IN ('verificando','aplicando','testando','publicando','verificando_resultado','concluido'))
);

CREATE INDEX IF NOT EXISTS nina_correcao_exec_feedback_idx
  ON public.nina_correcao_execucoes (feedback_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS nina_correcao_exec_uma_em_curso_idx
  ON public.nina_correcao_execucoes (feedback_id)
  WHERE status = 'em_curso';

GRANT SELECT, INSERT, UPDATE ON public.nina_correcao_execucoes TO authenticated;
GRANT ALL ON public.nina_correcao_execucoes TO service_role;

ALTER TABLE public.nina_correcao_execucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revisores veem execucoes de correcao da clinica"
  ON public.nina_correcao_execucoes FOR SELECT TO authenticated
  USING (public.nina_fb_pode_revisar(auth.uid(), clinica_id));

CREATE POLICY "Revisores criam execucoes de correcao da clinica"
  ON public.nina_correcao_execucoes FOR INSERT TO authenticated
  WITH CHECK (public.nina_fb_pode_revisar(auth.uid(), clinica_id) AND autorizado_por = auth.uid());

CREATE POLICY "Revisores atualizam execucoes de correcao da clinica"
  ON public.nina_correcao_execucoes FOR UPDATE TO authenticated
  USING (public.nina_fb_pode_revisar(auth.uid(), clinica_id))
  WITH CHECK (public.nina_fb_pode_revisar(auth.uid(), clinica_id));

CREATE TRIGGER nina_correcao_exec_touch
  BEFORE UPDATE ON public.nina_correcao_execucoes
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();