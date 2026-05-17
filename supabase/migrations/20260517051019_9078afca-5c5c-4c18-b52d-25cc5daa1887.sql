
-- Enum status do resultado
DO $$ BEGIN
  CREATE TYPE public.resultado_status AS ENUM ('pendente','normal','alterado','critico');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.alerta_enf_status AS ENUM ('aberto','em_contato','resolvido','sem_contato');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Resultados de exames
CREATE TABLE IF NOT EXISTS public.exame_resultados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  paciente_nome text,
  tipo_exame text NOT NULL,
  resultado_texto text NOT NULL,
  data_coleta date,
  origem text DEFAULT 'manual',
  status public.resultado_status NOT NULL DEFAULT 'pendente',
  ia_classificacao jsonb,
  ia_resumo text,
  ia_mensagem_paciente text,
  ia_recomendacao text,
  classificado_em timestamptz,
  classificado_por uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exame_resultados_clinica ON public.exame_resultados(clinica_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exame_resultados_paciente ON public.exame_resultados(paciente_id);

CREATE TRIGGER trg_exame_resultados_updated_at
BEFORE UPDATE ON public.exame_resultados
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.exame_resultados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "membros leem resultados"
ON public.exame_resultados FOR SELECT TO authenticated
USING (is_member(auth.uid(), clinica_id));

CREATE POLICY "membros criam resultados"
ON public.exame_resultados FOR INSERT TO authenticated
WITH CHECK (is_member(auth.uid(), clinica_id));

CREATE POLICY "membros editam resultados"
ON public.exame_resultados FOR UPDATE TO authenticated
USING (is_member(auth.uid(), clinica_id));

CREATE POLICY "gestores apagam resultados"
ON public.exame_resultados FOR DELETE TO authenticated
USING (can_manage_clinica(auth.uid(), clinica_id));

-- Alertas para a enfermagem
CREATE TABLE IF NOT EXISTS public.alertas_enfermagem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  paciente_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  paciente_nome text,
  origem text NOT NULL DEFAULT 'exame',
  origem_id uuid,
  severidade public.resultado_status NOT NULL DEFAULT 'alterado',
  titulo text NOT NULL,
  descricao text,
  mensagem_sugerida text,
  status public.alerta_enf_status NOT NULL DEFAULT 'aberto',
  responsavel_id uuid,
  observacao_contato text,
  contatado_em timestamptz,
  resolvido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alertas_enf_clinica ON public.alertas_enfermagem(clinica_id, status, severidade, created_at DESC);

CREATE TRIGGER trg_alertas_enf_updated_at
BEFORE UPDATE ON public.alertas_enfermagem
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.alertas_enfermagem ENABLE ROW LEVEL SECURITY;

CREATE POLICY "membros leem alertas enf"
ON public.alertas_enfermagem FOR SELECT TO authenticated
USING (is_member(auth.uid(), clinica_id));

CREATE POLICY "membros criam alertas enf"
ON public.alertas_enfermagem FOR INSERT TO authenticated
WITH CHECK (is_member(auth.uid(), clinica_id));

CREATE POLICY "membros editam alertas enf"
ON public.alertas_enfermagem FOR UPDATE TO authenticated
USING (is_member(auth.uid(), clinica_id));

CREATE POLICY "gestores apagam alertas enf"
ON public.alertas_enfermagem FOR DELETE TO authenticated
USING (can_manage_clinica(auth.uid(), clinica_id));
