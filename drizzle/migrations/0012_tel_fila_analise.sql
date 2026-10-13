CREATE TABLE public.tel_fila_analise (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id),
  origem text NOT NULL DEFAULT 'sufficit',
  externo_id text NOT NULL,
  estado text NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','transcrito','analisado','sem_gravacao','erro')),
  tentativas int NOT NULL DEFAULT 0,
  ultimo_erro text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.tel_fila_analise IS 'Fila de transcrição+análise de ligações atendidas. Escrita só pelo servidor (service role). ultimo_erro guarda só código, nunca corpo da resposta.';

CREATE UNIQUE INDEX tel_fila_analise_externo_uk ON public.tel_fila_analise (clinica_id, origem, externo_id);
CREATE INDEX tel_fila_analise_clinica_estado_idx ON public.tel_fila_analise (clinica_id, estado);

GRANT SELECT ON public.tel_fila_analise TO authenticated;
GRANT ALL ON public.tel_fila_analise TO service_role;

ALTER TABLE public.tel_fila_analise ENABLE ROW LEVEL SECURITY;

CREATE POLICY tel_fila_analise_select ON public.tel_fila_analise
  FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()) AND public.coach_pode_gerir(clinica_id));