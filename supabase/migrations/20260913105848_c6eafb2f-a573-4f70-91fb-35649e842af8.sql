CREATE TABLE public.atend_aviso_encaminhamento (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  chave TEXT NOT NULL,
  ambiente TEXT NOT NULL CHECK (ambiente IN ('producao','homologacao')),
  conversa_id UUID NOT NULL,
  sessao_id TEXT,
  turno_id TEXT,
  execucao_id UUID,
  handoff_evento_id UUID,
  protocolo TEXT,
  texto TEXT,
  texto_hash TEXT,
  estado TEXT NOT NULL DEFAULT 'preparado'
    CHECK (estado IN ('preparado','envio_pendente','confirmado','falhou','incerto')),
  mensagem_id UUID,
  transporte TEXT,
  transporte_id TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  ultimo_erro TEXT,
  preparado_por TEXT,
  enviado_em TIMESTAMP WITH TIME ZONE,
  confirmado_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT atend_aviso_encaminhamento_chave_unica UNIQUE (chave)
);

CREATE INDEX atend_aviso_encaminhamento_conversa_idx
  ON public.atend_aviso_encaminhamento (clinica_id, conversa_id, created_at DESC);

GRANT SELECT ON public.atend_aviso_encaminhamento TO authenticated;
GRANT ALL ON public.atend_aviso_encaminhamento TO service_role;

ALTER TABLE public.atend_aviso_encaminhamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros da clinica leem avisos de encaminhamento"
  ON public.atend_aviso_encaminhamento FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()));

CREATE TRIGGER atend_aviso_encaminhamento_touch
  BEFORE UPDATE ON public.atend_aviso_encaminhamento
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();