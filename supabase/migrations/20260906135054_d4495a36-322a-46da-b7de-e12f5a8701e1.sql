CREATE TABLE public.nina_analista_config (
  clinica_id uuid PRIMARY KEY REFERENCES public.clinicas(id) ON DELETE CASCADE,
  max_consultas_por_pergunta integer NOT NULL DEFAULT 6,
  max_rodadas integer NOT NULL DEFAULT 4,
  max_tokens_saida integer NOT NULL DEFAULT 6000,
  timeout_ms integer NOT NULL DEFAULT 300000,
  max_analises_por_dia integer NOT NULL DEFAULT 60,
  preco_input_por_milhao numeric(12,4),
  preco_output_por_milhao numeric(12,4),
  preco_moeda text NOT NULL DEFAULT 'USD',
  preco_vigencia_inicio date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nina_analista_config TO authenticated;
GRANT ALL ON public.nina_analista_config TO service_role;
ALTER TABLE public.nina_analista_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config analista visivel para revisores"
  ON public.nina_analista_config FOR SELECT TO authenticated
  USING (public.nina_fb_pode_revisar(auth.uid(), clinica_id));

CREATE POLICY "config analista gerenciada por admin"
  ON public.nina_analista_config FOR ALL TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE TABLE public.nina_analista_analises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  pergunta text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok','invalida','falha')),
  erro text,
  resposta jsonb,
  problemas jsonb NOT NULL DEFAULT '[]'::jsonb,
  resultados jsonb NOT NULL DEFAULT '[]'::jsonb,
  filtros_painel jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorte_utilizado text,
  modelo text NOT NULL,
  versao_regras text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  custo_estimado numeric(12,6),
  custo_moeda text,
  custo_preco_vigencia date,
  duracao_ms integer,
  dados_atualizados_em timestamptz NOT NULL DEFAULT now(),
  origem text NOT NULL DEFAULT 'pergunta',
  criado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nina_analista_analises_clinica
  ON public.nina_analista_analises (clinica_id, created_at DESC);

GRANT SELECT, INSERT ON public.nina_analista_analises TO authenticated;
GRANT ALL ON public.nina_analista_analises TO service_role;
ALTER TABLE public.nina_analista_analises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analises de metricas visiveis para revisores"
  ON public.nina_analista_analises FOR SELECT TO authenticated
  USING (public.nina_fb_pode_revisar(auth.uid(), clinica_id));

CREATE POLICY "analises de metricas criadas por revisores"
  ON public.nina_analista_analises FOR INSERT TO authenticated
  WITH CHECK (
    public.nina_fb_pode_revisar(auth.uid(), clinica_id)
    AND criado_por = auth.uid()
  );