CREATE TABLE public.site_agendamento_config (
  clinica_id uuid PRIMARY KEY REFERENCES public.clinicas(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  motivo text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid
);
GRANT SELECT ON public.site_agendamento_config TO authenticated;
GRANT ALL ON public.site_agendamento_config TO service_role;
ALTER TABLE public.site_agendamento_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_agendamento_config_select ON public.site_agendamento_config
  FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()));
COMMENT ON TABLE public.site_agendamento_config IS 'Liga/desliga o formulário de agendamento do site institucional por clínica. Ausência de linha = ligado. Escrita só pelo servidor.';
INSERT INTO public.site_agendamento_config (clinica_id, ativo, motivo)
VALUES ('7570ddde-8c1c-4b55-ba72-cf12b2a6c940', false, 'Desativado temporariamente a pedido da gestão em 14/10/2026');