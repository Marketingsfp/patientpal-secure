CREATE TABLE public.procedimento_especialidades (
  procedimento_id uuid NOT NULL REFERENCES public.procedimentos(id) ON DELETE CASCADE,
  especialidade_id uuid NOT NULL REFERENCES public.especialidades(id) ON DELETE CASCADE,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (procedimento_id, especialidade_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procedimento_especialidades TO authenticated;
GRANT ALL ON public.procedimento_especialidades TO service_role;

ALTER TABLE public.procedimento_especialidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "membros podem ver vínculos da clínica"
ON public.procedimento_especialidades FOR SELECT TO authenticated
USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY "membros podem criar vínculos da clínica"
ON public.procedimento_especialidades FOR INSERT TO authenticated
WITH CHECK (public.is_member(auth.uid(), clinica_id));

CREATE POLICY "membros podem atualizar vínculos da clínica"
ON public.procedimento_especialidades FOR UPDATE TO authenticated
USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY "membros podem excluir vínculos da clínica"
ON public.procedimento_especialidades FOR DELETE TO authenticated
USING (public.is_member(auth.uid(), clinica_id));

CREATE INDEX idx_proc_esp_especialidade ON public.procedimento_especialidades (especialidade_id);
CREATE INDEX idx_proc_esp_clin_esp ON public.procedimento_especialidades (clinica_id, especialidade_id);

-- Backfill: para cada consulta existente, criar vínculo com a especialidade cujo nome bate com o `grupo`
INSERT INTO public.procedimento_especialidades (procedimento_id, especialidade_id, clinica_id)
SELECT p.id, e.id, p.clinica_id
FROM public.procedimentos p
JOIN public.especialidades e ON lower(e.nome) = lower(p.grupo)
WHERE p.tipo = 'consulta' AND p.grupo IS NOT NULL
ON CONFLICT DO NOTHING;