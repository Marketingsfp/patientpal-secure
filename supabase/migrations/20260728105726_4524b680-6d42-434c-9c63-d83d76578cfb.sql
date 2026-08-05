CREATE TABLE public.clinica_tts_config (
  clinica_id uuid PRIMARY KEY REFERENCES public.clinicas(id) ON DELETE CASCADE,
  rate numeric NOT NULL DEFAULT 0.55 CHECK (rate >= 0.3 AND rate <= 1.5),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.clinica_tts_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinica_tts_config TO authenticated;
GRANT ALL ON public.clinica_tts_config TO service_role;

ALTER TABLE public.clinica_tts_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tts_config_select_all" ON public.clinica_tts_config
  FOR SELECT USING (true);

CREATE POLICY "tts_config_write_authenticated" ON public.clinica_tts_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_clinica_tts_config_touch
  BEFORE UPDATE ON public.clinica_tts_config
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.clinica_tts_config;
ALTER TABLE public.clinica_tts_config REPLICA IDENTITY FULL;