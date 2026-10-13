CREATE TABLE public.tel_transcricoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id),
  origem text NOT NULL DEFAULT 'sufficit',
  externo_id text NOT NULL,
  modelo text,
  segmentos jsonb NOT NULL,
  texto text NOT NULL,
  caracteres int NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.tel_transcricoes IS 'Transcrição da ligação vinda da telefonia (Sufficit). Conteúdo de conversa com paciente. Escrita só pelo servidor; nunca sobrescreve. Não separa falantes.';
CREATE UNIQUE INDEX tel_transcricoes_externo_uk ON public.tel_transcricoes (clinica_id, origem, externo_id);
GRANT SELECT ON public.tel_transcricoes TO authenticated;
GRANT ALL ON public.tel_transcricoes TO service_role;
ALTER TABLE public.tel_transcricoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tel_transcricoes_select ON public.tel_transcricoes
  FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()) AND public.coach_pode_gerir(clinica_id));

CREATE TABLE public.tel_analises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id),
  origem text NOT NULL DEFAULT 'sufficit',
  externo_id text NOT NULL,
  resultado jsonb NOT NULL,
  pontuacao numeric,
  criado_por uuid NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.tel_analises IS 'Análise por IA da transcrição de uma ligação. Escrita só pelo servidor; cada clique grava uma nova linha, nada é sobrescrito.';
CREATE INDEX tel_analises_chamada_idx ON public.tel_analises (clinica_id, origem, externo_id, criado_em DESC);
GRANT SELECT ON public.tel_analises TO authenticated;
GRANT ALL ON public.tel_analises TO service_role;
ALTER TABLE public.tel_analises ENABLE ROW LEVEL SECURITY;
CREATE POLICY tel_analises_select ON public.tel_analises
  FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()) AND public.coach_pode_gerir(clinica_id));