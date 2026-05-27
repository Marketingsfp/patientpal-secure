
-- 1) Routing rules
CREATE TABLE public.atend_routing_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  canal text,
  palavras_chave text[] NOT NULL DEFAULT '{}',
  horario_inicio time,
  horario_fim time,
  dias_semana int[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',
  departamento_id uuid REFERENCES public.atend_departamentos(id) ON DELETE SET NULL,
  mensagem_auto text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_routing_rules TO authenticated;
GRANT ALL ON public.atend_routing_rules TO service_role;

ALTER TABLE public.atend_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rr_select" ON public.atend_routing_rules FOR SELECT TO authenticated
  USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "rr_cud" ON public.atend_routing_rules FOR ALL TO authenticated
  USING (can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_atend_routing_rules_touch
  BEFORE UPDATE ON public.atend_routing_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.atend_routing_rules REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.atend_routing_rules;

-- 2) Capacidade do agente
ALTER TABLE public.atend_departamento_membros
  ADD COLUMN IF NOT EXISTS max_simultaneas integer NOT NULL DEFAULT 5;

-- 3) SLA primeira resposta humana
ALTER TABLE public.atend_conversas
  ADD COLUMN IF NOT EXISTS primeiro_resp_em timestamptz,
  ADD COLUMN IF NOT EXISTS sla_first_response_seg integer;

CREATE INDEX IF NOT EXISTS idx_atend_routing_rules_clinica
  ON public.atend_routing_rules(clinica_id, ativo, ordem);
