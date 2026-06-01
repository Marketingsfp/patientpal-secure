-- Adiciona legacy_id para futuro DE-PARA
ALTER TABLE public.medicos ADD COLUMN IF NOT EXISTS legacy_id bigint;
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS legacy_id bigint;
CREATE INDEX IF NOT EXISTS idx_medicos_legacy_id ON public.medicos(clinica_id, legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pacientes_legacy_id ON public.pacientes(clinica_id, legacy_id) WHERE legacy_id IS NOT NULL;

-- Staging para agendamentos importados do sistema antigo
CREATE TABLE IF NOT EXISTS public.agendamentos_legacy_import (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  codigo_agenda bigint NOT NULL,
  codigo_profissional bigint,
  codigo_cliente bigint,
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  situacao text,
  observacao text,
  turno text,
  encaixe text,
  confirmacao timestamptz,
  cancelamento timestamptz,
  data_geracao timestamptz,
  data_marcacao timestamptz,
  baixa timestamptz,
  chegou_clinica text,
  atendido text,
  telemedicina text,
  raw jsonb,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  migrado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, codigo_agenda)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agendamentos_legacy_import TO authenticated;
GRANT ALL ON public.agendamentos_legacy_import TO service_role;

ALTER TABLE public.agendamentos_legacy_import ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ali_select" ON public.agendamentos_legacy_import
  FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "ali_manage" ON public.agendamentos_legacy_import
  FOR ALL TO authenticated
  USING (can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

CREATE INDEX idx_ali_clinica_prof ON public.agendamentos_legacy_import(clinica_id, codigo_profissional);
CREATE INDEX idx_ali_clinica_cli ON public.agendamentos_legacy_import(clinica_id, codigo_cliente);
CREATE INDEX idx_ali_inicio ON public.agendamentos_legacy_import(clinica_id, inicio);