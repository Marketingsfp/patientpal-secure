CREATE TABLE public.nina_feedback_erros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  conversa_id uuid,
  mensagem_id uuid,
  mensagem_texto text,
  pergunta_texto text,
  categoria text NOT NULL,
  correcao text NOT NULL,
  observacao text,
  status text NOT NULL DEFAULT 'pending',
  reportado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_fb_status_chk CHECK (status IN ('pending','approved','rejected','applied')),
  CONSTRAINT nina_fb_categoria_chk CHECK (categoria IN (
    'valor_incorreto','medico_incorreto','unidade_incorreta','horario_incorreto',
    'procedimento_incorreto','preparo_incorreto','informacao_inexistente',
    'informacao_inventada','informacao_nao_encontrada','handoff_deveria_ocorrer',
    'handoff_desnecessario','resposta_incompleta','interpretacao_incorreta','outro'))
);

CREATE INDEX nina_fb_clinica_idx ON public.nina_feedback_erros (clinica_id, status, created_at DESC);
CREATE INDEX nina_fb_conversa_idx ON public.nina_feedback_erros (conversa_id);
CREATE INDEX nina_fb_mensagem_idx ON public.nina_feedback_erros (mensagem_id);

GRANT SELECT, INSERT ON public.nina_feedback_erros TO authenticated;
GRANT ALL ON public.nina_feedback_erros TO service_role;

ALTER TABLE public.nina_feedback_erros ENABLE ROW LEVEL SECURITY;

CREATE POLICY nina_fb_select ON public.nina_feedback_erros FOR SELECT TO authenticated
  USING (is_member(auth.uid(), clinica_id));
CREATE POLICY nina_fb_insert ON public.nina_feedback_erros FOR INSERT TO authenticated
  WITH CHECK (is_member(auth.uid(), clinica_id) AND reportado_por = auth.uid());

CREATE TRIGGER nina_fb_touch BEFORE UPDATE ON public.nina_feedback_erros
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();