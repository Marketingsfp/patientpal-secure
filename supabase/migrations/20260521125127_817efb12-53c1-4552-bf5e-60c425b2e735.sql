ALTER TABLE public.clinicas
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS raio_metros integer NOT NULL DEFAULT 200;