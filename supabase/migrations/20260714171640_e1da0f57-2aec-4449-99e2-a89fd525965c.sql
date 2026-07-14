CREATE TABLE public.agendamento_historico_notas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null,
  agendamento_id uuid not null,
  user_email text,
  user_nome text,
  texto text not null check (char_length(texto) between 1 and 1000),
  created_at timestamptz not null default now()
);
CREATE INDEX idx_agnh_ag_created ON public.agendamento_historico_notas(agendamento_id, created_at DESC);

GRANT SELECT, INSERT ON public.agendamento_historico_notas TO authenticated;
GRANT ALL ON public.agendamento_historico_notas TO service_role;

ALTER TABLE public.agendamento_historico_notas ENABLE ROW LEVEL SECURITY;

CREATE POLICY agnh_select ON public.agendamento_historico_notas
  FOR SELECT USING (is_member(auth.uid(), clinica_id));
CREATE POLICY agnh_insert ON public.agendamento_historico_notas
  FOR INSERT WITH CHECK (is_member(auth.uid(), clinica_id));