
-- 0) Limpa horários órfãos (médico já excluído)
DELETE FROM public.medico_disponibilidades d
WHERE NOT EXISTS (SELECT 1 FROM public.medicos m WHERE m.id = d.medico_id);

-- 1) medico_agendas
CREATE TABLE public.medico_agendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  medico_id uuid NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cor text,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_medico_agendas_medico ON public.medico_agendas(medico_id);
CREATE INDEX idx_medico_agendas_clinica ON public.medico_agendas(clinica_id);
CREATE UNIQUE INDEX uq_medico_agendas_nome ON public.medico_agendas(medico_id, lower(nome));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.medico_agendas TO authenticated;
GRANT ALL ON public.medico_agendas TO service_role;
ALTER TABLE public.medico_agendas ENABLE ROW LEVEL SECURITY;

CREATE POLICY ma_select ON public.medico_agendas FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY ma_insert ON public.medico_agendas FOR INSERT TO authenticated WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY ma_update ON public.medico_agendas FOR UPDATE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY ma_delete ON public.medico_agendas FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_ma_updated BEFORE UPDATE ON public.medico_agendas FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER tg_uppercase_text_fields_ma BEFORE INSERT OR UPDATE ON public.medico_agendas FOR EACH ROW EXECUTE FUNCTION uppercase_text_fields();

-- 2) Back-fill
INSERT INTO public.medico_agendas (clinica_id, medico_id, nome, ordem)
SELECT m.clinica_id, m.id, 'CONSULTAS', 0
FROM public.medicos m;

-- 3) medico_agenda_procedimentos
CREATE TABLE public.medico_agenda_procedimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  agenda_id uuid NOT NULL REFERENCES public.medico_agendas(id) ON DELETE CASCADE,
  procedimento_id uuid NOT NULL REFERENCES public.procedimentos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_map_agenda_proc ON public.medico_agenda_procedimentos(agenda_id, procedimento_id);
CREATE INDEX idx_map_proc ON public.medico_agenda_procedimentos(procedimento_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.medico_agenda_procedimentos TO authenticated;
GRANT ALL ON public.medico_agenda_procedimentos TO service_role;
ALTER TABLE public.medico_agenda_procedimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY map_select ON public.medico_agenda_procedimentos FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY map_insert ON public.medico_agenda_procedimentos FOR INSERT TO authenticated WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY map_update ON public.medico_agenda_procedimentos FOR UPDATE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY map_delete ON public.medico_agenda_procedimentos FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));

-- 4) agenda_id em medico_disponibilidades
ALTER TABLE public.medico_disponibilidades ADD COLUMN agenda_id uuid REFERENCES public.medico_agendas(id) ON DELETE CASCADE;

UPDATE public.medico_disponibilidades d
SET agenda_id = a.id
FROM public.medico_agendas a
WHERE a.medico_id = d.medico_id AND a.nome = 'CONSULTAS'
  AND d.agenda_id IS NULL;

ALTER TABLE public.medico_disponibilidades ALTER COLUMN agenda_id SET NOT NULL;
CREATE INDEX idx_md_agenda ON public.medico_disponibilidades(agenda_id);

-- 5) agenda_id em agendamentos (nullable)
ALTER TABLE public.agendamentos ADD COLUMN agenda_id uuid REFERENCES public.medico_agendas(id) ON DELETE SET NULL;

UPDATE public.agendamentos ag
SET agenda_id = a.id
FROM public.medico_agendas a
WHERE a.medico_id = ag.medico_id AND a.nome = 'CONSULTAS'
  AND ag.agenda_id IS NULL AND ag.medico_id IS NOT NULL;

CREATE INDEX idx_agendamentos_agenda ON public.agendamentos(agenda_id);
