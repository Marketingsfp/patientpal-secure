CREATE TABLE public.tel_chamadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id),
  origem text NOT NULL DEFAULT 'sufficit',
  externo_id text NOT NULL,
  inicio timestamptz NOT NULL,
  duracao_seg int,
  tarifado_seg int,
  direcao text,
  situacao text,
  modelo text,
  origem_numero text,
  destino_numero text,
  discado text,
  did text,
  payload jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.tel_chamadas IS 'Ligações importadas da telefonia (Sufficit). Contém telefone de paciente. Escrita só pelo servidor (service role); importação aditiva, nunca apaga.';
COMMENT ON COLUMN public.tel_chamadas.duracao_seg IS 'Campo duration da origem. Não assumir que é tempo de conversa.';
COMMENT ON COLUMN public.tel_chamadas.tarifado_seg IS 'Campo billing da origem. Guardado separado de duration.';

CREATE UNIQUE INDEX tel_chamadas_externo_uk ON public.tel_chamadas (clinica_id, origem, externo_id);
CREATE INDEX tel_chamadas_clinica_inicio_idx ON public.tel_chamadas (clinica_id, inicio DESC);

GRANT SELECT ON public.tel_chamadas TO authenticated;
GRANT ALL ON public.tel_chamadas TO service_role;

ALTER TABLE public.tel_chamadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY tel_chamadas_select ON public.tel_chamadas
  FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()) AND public.coach_pode_gerir(clinica_id));