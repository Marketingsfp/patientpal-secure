CREATE TABLE IF NOT EXISTS public.atend_handoff_resumos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null,
  conversa_id uuid not null references public.atend_conversas(id) on delete cascade,
  versao integer not null default 1,
  handoff_em timestamptz not null,
  motivo text,
  status text not null default 'gerando',
  payload jsonb,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE UNIQUE INDEX IF NOT EXISTS atend_handoff_resumos_conversa_handoff_uidx
  ON public.atend_handoff_resumos (conversa_id, handoff_em);
CREATE INDEX IF NOT EXISTS atend_handoff_resumos_conversa_idx
  ON public.atend_handoff_resumos (conversa_id, versao DESC);

GRANT SELECT, INSERT, UPDATE ON public.atend_handoff_resumos TO authenticated;
GRANT ALL ON public.atend_handoff_resumos TO service_role;

ALTER TABLE public.atend_handoff_resumos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "handoff_resumos: membros leem" ON public.atend_handoff_resumos
  FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "handoff_resumos: membros inserem" ON public.atend_handoff_resumos
  FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY "handoff_resumos: membros atualizam" ON public.atend_handoff_resumos
  FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id))
  WITH CHECK (is_member(auth.uid(), clinica_id));

CREATE TRIGGER atend_handoff_resumos_touch BEFORE UPDATE ON public.atend_handoff_resumos
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();