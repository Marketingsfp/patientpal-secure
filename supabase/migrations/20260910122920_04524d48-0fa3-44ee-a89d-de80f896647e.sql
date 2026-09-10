ALTER TABLE public.nina_confianca_decisoes
  ADD COLUMN IF NOT EXISTS revisao_conversa BIGINT,
  ADD COLUMN IF NOT EXISTS evidencias_hash TEXT,
  ADD COLUMN IF NOT EXISTS origem_resposta TEXT,
  ADD COLUMN IF NOT EXISTS rodadas INTEGER,
  ADD COLUMN IF NOT EXISTS representacao TEXT;

CREATE TABLE IF NOT EXISTS public.nina_confianca_vinculos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID NOT NULL,
  decisao_id UUID REFERENCES public.nina_confianca_decisoes(id) ON DELETE RESTRICT,
  execucao_id UUID,
  conversation_id UUID,
  outgoing_message_id UUID,
  representacao TEXT NOT NULL DEFAULT 'texto_completo',
  estado TEXT NOT NULL DEFAULT 'preparada',
  texto_hash TEXT,
  transporte_id TEXT,
  detalhe JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nina_confianca_vinculos_decisao_idx
  ON public.nina_confianca_vinculos (decisao_id, created_at DESC);
CREATE INDEX IF NOT EXISTS nina_confianca_vinculos_msg_idx
  ON public.nina_confianca_vinculos (clinica_id, outgoing_message_id);
CREATE INDEX IF NOT EXISTS nina_confianca_vinculos_exec_idx
  ON public.nina_confianca_vinculos (clinica_id, execucao_id, created_at DESC);

GRANT SELECT ON public.nina_confianca_vinculos TO authenticated;
GRANT ALL ON public.nina_confianca_vinculos TO service_role;

ALTER TABLE public.nina_confianca_vinculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros da clinica leem vinculos de entrega"
  ON public.nina_confianca_vinculos FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()));

CREATE OR REPLACE FUNCTION public.nina_confianca_vinculos_imutavel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'nina_confianca_vinculos e um registro historico imutavel: alteracao/exclusao nao permitida';
END;
$$;

DROP TRIGGER IF EXISTS nina_confianca_vinculos_imutavel_trg ON public.nina_confianca_vinculos;
CREATE TRIGGER nina_confianca_vinculos_imutavel_trg
  BEFORE UPDATE OR DELETE ON public.nina_confianca_vinculos
  FOR EACH ROW EXECUTE FUNCTION public.nina_confianca_vinculos_imutavel();