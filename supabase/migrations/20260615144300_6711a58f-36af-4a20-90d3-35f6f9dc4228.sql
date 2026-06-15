CREATE TABLE IF NOT EXISTS public._tmp_prontuario_updates (paciente_id uuid PRIMARY KEY, novo text NOT NULL);
GRANT SELECT, INSERT, UPDATE, DELETE ON public._tmp_prontuario_updates TO authenticated;
GRANT ALL ON public._tmp_prontuario_updates TO service_role;
ALTER TABLE public._tmp_prontuario_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public._tmp_prontuario_updates FOR ALL USING (false) WITH CHECK (false);