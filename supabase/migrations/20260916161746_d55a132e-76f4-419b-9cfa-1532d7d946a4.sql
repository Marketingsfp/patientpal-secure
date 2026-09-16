ALTER TABLE public.coach_roleplay_sessions
  ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'voz';

ALTER TABLE public.coach_roleplay_sessions
  DROP CONSTRAINT IF EXISTS coach_roleplay_sessions_modo_check;

ALTER TABLE public.coach_roleplay_sessions
  ADD CONSTRAINT coach_roleplay_sessions_modo_check CHECK (modo IN ('voz', 'texto'));