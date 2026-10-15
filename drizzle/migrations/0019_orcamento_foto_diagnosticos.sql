CREATE TABLE public.orcamento_foto_diagnosticos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  sessao_id uuid,
  mime_recebido text,
  bytes_enviados integer,
  largura_original integer,
  altura_original integer,
  largura_enviada integer,
  altura_enviada integer,
  user_agent text,
  veredito_ia text,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orcamento_foto_diagnosticos IS 'Metadados de leituras ilegíveis da foto do pedido pelo celular. Nunca guarda imagem nem texto do pedido.';
CREATE INDEX orcamento_foto_diagnosticos_clinica_idx ON public.orcamento_foto_diagnosticos (clinica_id, created_at DESC);
GRANT SELECT ON public.orcamento_foto_diagnosticos TO authenticated;
GRANT ALL ON public.orcamento_foto_diagnosticos TO service_role;
ALTER TABLE public.orcamento_foto_diagnosticos ENABLE ROW LEVEL SECURITY;
CREATE POLICY orcamento_foto_diagnosticos_select ON public.orcamento_foto_diagnosticos
  FOR SELECT TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));