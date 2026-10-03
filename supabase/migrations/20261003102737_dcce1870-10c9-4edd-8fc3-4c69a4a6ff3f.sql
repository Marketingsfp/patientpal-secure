ALTER TABLE public.nina_jev_limites
  ADD COLUMN IF NOT EXISTS urgencia_dor_ar numeric CHECK (urgencia_dor_ar >= 0.3 AND urgencia_dor_ar <= 0.95),
  ADD COLUMN IF NOT EXISTS urgencia_sangramento_desmaio numeric CHECK (urgencia_sangramento_desmaio >= 0.3 AND urgencia_sangramento_desmaio <= 0.95),
  ADD COLUMN IF NOT EXISTS urgencia_gestante numeric CHECK (urgencia_gestante >= 0.3 AND urgencia_gestante <= 0.95),
  ADD COLUMN IF NOT EXISTS urgencia_crianca_idoso numeric CHECK (urgencia_crianca_idoso >= 0.3 AND urgencia_crianca_idoso <= 0.95);