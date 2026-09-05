ALTER TABLE public.atend_conversas
  ADD COLUMN IF NOT EXISTS awaiting_patient_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS patient_response_deadline TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_atend_conversas_patient_deadline
  ON public.atend_conversas (patient_response_deadline)
  WHERE patient_response_deadline IS NOT NULL;