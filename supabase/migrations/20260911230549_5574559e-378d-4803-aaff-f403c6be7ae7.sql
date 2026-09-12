ALTER TABLE public.nina_feedback_analises
  ADD COLUMN IF NOT EXISTS pacote jsonb,
  ADD COLUMN IF NOT EXISTS pacote_hash text,
  ADD COLUMN IF NOT EXISTS pacote_revisao integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.nina_feedback_analises.pacote IS
  'Pacote de evidencias (contrato pacote-evidencias-v1) que fundamentou esta analise.';
COMMENT ON COLUMN public.nina_feedback_analises.pacote_hash IS
  'Hash do pacote: identifica o conjunto de evidencias usado. Contagens nao substituem o hash.';
COMMENT ON COLUMN public.nina_feedback_analises.pacote_revisao IS
  'Revisao do pacote; sobe a cada enriquecimento das evidencias.';