ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS teste boolean NOT NULL DEFAULT false;
ALTER TABLE public.contratos_assinatura ADD COLUMN IF NOT EXISTS teste boolean NOT NULL DEFAULT false;
ALTER TABLE public.fin_atendimentos ADD COLUMN IF NOT EXISTS teste boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_pacientes_teste ON public.pacientes(teste) WHERE teste;
CREATE INDEX IF NOT EXISTS idx_contratos_assinatura_teste ON public.contratos_assinatura(teste) WHERE teste;
CREATE INDEX IF NOT EXISTS idx_fin_atendimentos_teste ON public.fin_atendimentos(teste) WHERE teste;

CREATE TABLE IF NOT EXISTS public.qa_cb_casos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id uuid NOT NULL,
  execucao text NOT NULL,
  caso integer NOT NULL,
  convenio_id uuid,
  convenio_nome text,
  procedimento_id uuid,
  procedimento_nome text,
  cenario text NOT NULL,
  detalhe text,
  paciente_id uuid,
  contrato_id uuid,
  valor_particular numeric NOT NULL DEFAULT 0,
  valor_esperado numeric NOT NULL DEFAULT 0,
  valor_obtido numeric NOT NULL DEFAULT 0,
  forma text,
  passou boolean NOT NULL DEFAULT false,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_cb_casos TO authenticated;
GRANT ALL ON public.qa_cb_casos TO service_role;
ALTER TABLE public.qa_cb_casos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qa_cb_casos_select" ON public.qa_cb_casos FOR SELECT TO authenticated USING (true);
CREATE POLICY "qa_cb_casos_insert" ON public.qa_cb_casos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qa_cb_casos_update" ON public.qa_cb_casos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "qa_cb_casos_delete" ON public.qa_cb_casos FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_qa_cb_casos_exec ON public.qa_cb_casos(execucao, caso);