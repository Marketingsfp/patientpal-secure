CREATE TABLE public.nina_remarcacoes_pendentes (
  conversa_id uuid PRIMARY KEY,
  clinica_id uuid NOT NULL,
  paciente_id uuid NOT NULL,
  agendamento_id uuid NOT NULL,
  novo_inicio timestamptz NOT NULL,
  novo_fim timestamptz NOT NULL,
  teste boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL
);
GRANT ALL ON public.nina_remarcacoes_pendentes TO service_role;
ALTER TABLE public.nina_remarcacoes_pendentes ENABLE ROW LEVEL SECURITY;