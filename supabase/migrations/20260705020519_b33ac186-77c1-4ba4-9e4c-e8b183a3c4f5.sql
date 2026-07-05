
-- Fase 3.b Migration A — Regras de procedimento + override por unidade

-- 1) Colunas de regra em procedimentos
ALTER TABLE public.procedimentos
  ADD COLUMN IF NOT EXISTS tipo_procedimento text,
  ADD COLUMN IF NOT EXISTS fluxo_atendimento text,
  ADD COLUMN IF NOT EXISTS agenda_obrigatoria boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS medico_obrigatorio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sala_obrigatoria boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS equipamento_obrigatorio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permite_encaixe boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS permite_venda_direta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permite_orcamento boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS exige_autorizacao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exige_preparo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exige_termo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tempo_padrao_min integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS cor_agenda text;

DO $$ BEGIN
  ALTER TABLE public.procedimentos
    ADD CONSTRAINT procedimentos_tipo_procedimento_check CHECK (
      tipo_procedimento IS NULL OR tipo_procedimento = ANY (ARRAY[
        'consulta','exame','laboratorio','procedimento','cirurgia',
        'equipamento','vacina','telemedicina'
      ])
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.procedimentos
    ADD CONSTRAINT procedimentos_fluxo_atendimento_check CHECK (
      fluxo_atendimento IS NULL OR fluxo_atendimento = ANY (ARRAY[
        'consulta_medica','exame_agendado','lab_ordem_chegada','lab_agendado',
        'procedimento_ambulatorial','equipamento','domiciliar','telemedicina',
        'venda_balcao'
      ])
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Backfill
UPDATE public.procedimentos
SET fluxo_atendimento = CASE tipo_destino
  WHEN 'consulta'            THEN 'consulta_medica'
  WHEN 'exame_equipamento'   THEN 'exame_agendado'
  WHEN 'laboratorio'         THEN 'lab_agendado'
  WHEN 'procedimento_medico' THEN 'procedimento_ambulatorial'
  WHEN 'venda_balcao'        THEN 'venda_balcao'
  ELSE NULL
END
WHERE fluxo_atendimento IS NULL AND tipo_destino IS NOT NULL;

UPDATE public.procedimentos
SET tipo_procedimento = CASE tipo_destino
  WHEN 'consulta'            THEN 'consulta'
  WHEN 'exame_equipamento'   THEN 'equipamento'
  WHEN 'laboratorio'         THEN 'laboratorio'
  WHEN 'procedimento_medico' THEN 'procedimento'
  ELSE NULL
END
WHERE tipo_procedimento IS NULL AND tipo_destino IS NOT NULL;

UPDATE public.procedimentos SET medico_obrigatorio = true, agenda_obrigatoria = true
WHERE fluxo_atendimento IN ('consulta_medica','procedimento_ambulatorial','telemedicina')
  AND medico_obrigatorio = false;

UPDATE public.procedimentos SET equipamento_obrigatorio = true, agenda_obrigatoria = true
WHERE fluxo_atendimento IN ('exame_agendado','equipamento') AND equipamento_obrigatorio = false;

UPDATE public.procedimentos SET agenda_obrigatoria = false, permite_venda_direta = true
WHERE fluxo_atendimento = 'venda_balcao';

UPDATE public.procedimentos SET agenda_obrigatoria = false
WHERE fluxo_atendimento = 'lab_ordem_chegada';

-- 3) Trigger para manter tipo_destino sincronizado
CREATE OR REPLACE FUNCTION public.fn_sync_procedimento_tipo_destino()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.tipo_destino := CASE NEW.fluxo_atendimento
    WHEN 'consulta_medica'            THEN 'consulta'
    WHEN 'exame_agendado'             THEN 'exame_equipamento'
    WHEN 'equipamento'                THEN 'exame_equipamento'
    WHEN 'lab_ordem_chegada'          THEN 'laboratorio'
    WHEN 'lab_agendado'               THEN 'laboratorio'
    WHEN 'procedimento_ambulatorial'  THEN 'procedimento_medico'
    WHEN 'telemedicina'               THEN 'consulta'
    WHEN 'domiciliar'                 THEN 'procedimento_medico'
    WHEN 'venda_balcao'               THEN 'venda_balcao'
    ELSE NULL
  END;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_procedimento_tipo_destino ON public.procedimentos;
CREATE TRIGGER trg_sync_procedimento_tipo_destino
BEFORE INSERT OR UPDATE OF fluxo_atendimento ON public.procedimentos
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_procedimento_tipo_destino();

-- 4) Tabela de override por unidade
CREATE TABLE IF NOT EXISTS public.procedimento_unidade_regras (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  procedimento_id uuid NOT NULL REFERENCES public.procedimentos(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  tipo_procedimento text,
  fluxo_atendimento text,
  agenda_obrigatoria boolean,
  medico_obrigatorio boolean,
  sala_obrigatoria boolean,
  equipamento_obrigatorio boolean,
  permite_encaixe boolean,
  permite_venda_direta boolean,
  permite_orcamento boolean,
  exige_autorizacao boolean,
  exige_preparo boolean,
  exige_termo boolean,
  tempo_padrao_min integer,
  cor_agenda text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (procedimento_id, unidade_id),
  CONSTRAINT pur_tipo_procedimento_check CHECK (
    tipo_procedimento IS NULL OR tipo_procedimento = ANY (ARRAY[
      'consulta','exame','laboratorio','procedimento','cirurgia',
      'equipamento','vacina','telemedicina'
    ])
  ),
  CONSTRAINT pur_fluxo_atendimento_check CHECK (
    fluxo_atendimento IS NULL OR fluxo_atendimento = ANY (ARRAY[
      'consulta_medica','exame_agendado','lab_ordem_chegada','lab_agendado',
      'procedimento_ambulatorial','equipamento','domiciliar','telemedicina',
      'venda_balcao'
    ])
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procedimento_unidade_regras TO authenticated;
GRANT ALL ON public.procedimento_unidade_regras TO service_role;

ALTER TABLE public.procedimento_unidade_regras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pur_select" ON public.procedimento_unidade_regras;
CREATE POLICY "pur_select" ON public.procedimento_unidade_regras
  FOR SELECT TO authenticated
  USING (is_member(auth.uid(), clinica_id));

DROP POLICY IF EXISTS "pur_insert" ON public.procedimento_unidade_regras;
CREATE POLICY "pur_insert" ON public.procedimento_unidade_regras
  FOR INSERT TO authenticated
  WITH CHECK (
    is_member(auth.uid(), clinica_id)
    AND (has_role(auth.uid(), clinica_id, 'admin'::app_role)
      OR has_role(auth.uid(), clinica_id, 'gestor'::app_role))
  );

DROP POLICY IF EXISTS "pur_update" ON public.procedimento_unidade_regras;
CREATE POLICY "pur_update" ON public.procedimento_unidade_regras
  FOR UPDATE TO authenticated
  USING (
    is_member(auth.uid(), clinica_id)
    AND (has_role(auth.uid(), clinica_id, 'admin'::app_role)
      OR has_role(auth.uid(), clinica_id, 'gestor'::app_role))
  );

DROP POLICY IF EXISTS "pur_delete" ON public.procedimento_unidade_regras;
CREATE POLICY "pur_delete" ON public.procedimento_unidade_regras
  FOR DELETE TO authenticated
  USING (
    is_member(auth.uid(), clinica_id)
    AND (has_role(auth.uid(), clinica_id, 'admin'::app_role)
      OR has_role(auth.uid(), clinica_id, 'gestor'::app_role))
  );

CREATE OR REPLACE FUNCTION public.fn_pur_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_pur_touch_updated_at ON public.procedimento_unidade_regras;
CREATE TRIGGER trg_pur_touch_updated_at
BEFORE UPDATE ON public.procedimento_unidade_regras
FOR EACH ROW EXECUTE FUNCTION public.fn_pur_touch_updated_at();

-- 5) Função de merge de regras
CREATE OR REPLACE FUNCTION public.fn_regras_procedimento(
  p_procedimento_id uuid,
  p_unidade_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'procedimento_id',        p.id,
    'unidade_id',             p_unidade_id,
    'tipo_procedimento',      COALESCE(o.tipo_procedimento,       p.tipo_procedimento),
    'fluxo_atendimento',      COALESCE(o.fluxo_atendimento,       p.fluxo_atendimento),
    'agenda_obrigatoria',     COALESCE(o.agenda_obrigatoria,      p.agenda_obrigatoria),
    'medico_obrigatorio',     COALESCE(o.medico_obrigatorio,      p.medico_obrigatorio),
    'sala_obrigatoria',       COALESCE(o.sala_obrigatoria,        p.sala_obrigatoria),
    'equipamento_obrigatorio',COALESCE(o.equipamento_obrigatorio, p.equipamento_obrigatorio),
    'permite_encaixe',        COALESCE(o.permite_encaixe,         p.permite_encaixe),
    'permite_venda_direta',   COALESCE(o.permite_venda_direta,    p.permite_venda_direta),
    'permite_orcamento',      COALESCE(o.permite_orcamento,       p.permite_orcamento),
    'exige_autorizacao',      COALESCE(o.exige_autorizacao,       p.exige_autorizacao),
    'exige_preparo',          COALESCE(o.exige_preparo,           p.exige_preparo),
    'exige_termo',            COALESCE(o.exige_termo,             p.exige_termo),
    'tempo_padrao_min',       COALESCE(o.tempo_padrao_min,        p.tempo_padrao_min),
    'cor_agenda',             COALESCE(o.cor_agenda,              p.cor_agenda),
    'tipo_recurso',           p.tipo_recurso,
    'requer_medico',          p.requer_medico,
    'requer_sala',            p.requer_sala,
    'origem_override',        (o.id IS NOT NULL)
  )
  FROM public.procedimentos p
  LEFT JOIN public.procedimento_unidade_regras o
    ON o.procedimento_id = p.id
   AND p_unidade_id IS NOT NULL
   AND o.unidade_id = p_unidade_id
  WHERE p.id = p_procedimento_id;
$$;

GRANT EXECUTE ON FUNCTION public.fn_regras_procedimento(uuid, uuid) TO authenticated;
