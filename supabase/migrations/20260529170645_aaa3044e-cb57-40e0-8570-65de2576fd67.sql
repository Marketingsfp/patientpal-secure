-- =============================================================
-- Enfermagem: recursos agendáveis (salas/exames) compartilhados
-- =============================================================

-- 1) Tabela de recursos (salas) de enfermagem
CREATE TABLE public.enfermagem_recursos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  cor text,
  duracao_padrao_min integer NOT NULL DEFAULT 30,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_enf_recursos_clinica ON public.enfermagem_recursos(clinica_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enfermagem_recursos TO authenticated;
GRANT ALL ON public.enfermagem_recursos TO service_role;

ALTER TABLE public.enfermagem_recursos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "membros leem recursos" ON public.enfermagem_recursos
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY "gestores gerenciam recursos" ON public.enfermagem_recursos
  FOR ALL TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_enf_recursos_updated_at
  BEFORE UPDATE ON public.enfermagem_recursos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_enf_recursos_uppercase
  BEFORE INSERT OR UPDATE ON public.enfermagem_recursos
  FOR EACH ROW EXECUTE FUNCTION public.uppercase_text_fields();

-- 2) Procedimentos vinculados ao recurso
CREATE TABLE public.enfermagem_recurso_procedimentos (
  recurso_id uuid NOT NULL REFERENCES public.enfermagem_recursos(id) ON DELETE CASCADE,
  procedimento_id uuid NOT NULL REFERENCES public.procedimentos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recurso_id, procedimento_id)
);
CREATE INDEX idx_enf_recproc_recurso ON public.enfermagem_recurso_procedimentos(recurso_id);
CREATE INDEX idx_enf_recproc_proc ON public.enfermagem_recurso_procedimentos(procedimento_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enfermagem_recurso_procedimentos TO authenticated;
GRANT ALL ON public.enfermagem_recurso_procedimentos TO service_role;

ALTER TABLE public.enfermagem_recurso_procedimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "membros leem vinculos" ON public.enfermagem_recurso_procedimentos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.enfermagem_recursos r
    WHERE r.id = recurso_id AND public.is_member(auth.uid(), r.clinica_id)
  ));

CREATE POLICY "gestores gerenciam vinculos" ON public.enfermagem_recurso_procedimentos
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.enfermagem_recursos r
    WHERE r.id = recurso_id AND public.can_manage_clinica(auth.uid(), r.clinica_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.enfermagem_recursos r
    WHERE r.id = recurso_id AND public.can_manage_clinica(auth.uid(), r.clinica_id)
  ));

-- 3) Agendamentos: novas colunas
ALTER TABLE public.agendamentos
  ADD COLUMN enfermagem_recurso_id uuid REFERENCES public.enfermagem_recursos(id) ON DELETE SET NULL,
  ADD COLUMN executado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN executado_em timestamptz;

CREATE INDEX idx_agend_enf_recurso ON public.agendamentos(enfermagem_recurso_id);
CREATE INDEX idx_agend_executado_por ON public.agendamentos(executado_por);

-- Restrição: pelo menos um responsável (médico OU recurso de enfermagem)
ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_medico_ou_recurso
  CHECK (medico_id IS NOT NULL OR enfermagem_recurso_id IS NOT NULL);

-- 4) Seed: sugestões iniciais para a clínica
DO $$
DECLARE _cl record;
DECLARE _nomes text[] := ARRAY[
  'EXAME DE ELETROCARDIOGRAMA',
  'EXAME DE MAPA 24H',
  'EXAME DE HOLTER',
  'EXAME DE ITB',
  'SALA ENFERMAGEM'
];
DECLARE _n text;
BEGIN
  FOR _cl IN SELECT id FROM public.clinicas LOOP
    FOREACH _n IN ARRAY _nomes LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.enfermagem_recursos
        WHERE clinica_id = _cl.id AND upper(nome) = _n
      ) THEN
        INSERT INTO public.enfermagem_recursos (clinica_id, nome, duracao_padrao_min)
        VALUES (_cl.id, _n, 30);
      END IF;
    END LOOP;
  END LOOP;
END $$;