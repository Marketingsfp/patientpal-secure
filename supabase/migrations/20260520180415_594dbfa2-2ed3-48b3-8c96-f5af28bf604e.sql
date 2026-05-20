
-- HR CONTRATOS
CREATE TABLE IF NOT EXISTS public.hr_contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  numero integer NOT NULL DEFAULT 0,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  funcionario_nome text NOT NULL,
  cpf text,
  cargo_id uuid REFERENCES public.cargos(id) ON DELETE SET NULL,
  setor_id uuid REFERENCES public.setores(id) ON DELETE SET NULL,
  unidade_id uuid REFERENCES public.unidades(id) ON DELETE SET NULL,
  regime text NOT NULL DEFAULT 'clt',
  carga_horaria_semanal numeric(5,2) NOT NULL DEFAULT 44,
  salario numeric(12,2) NOT NULL DEFAULT 0,
  data_admissao date NOT NULL DEFAULT CURRENT_DATE,
  data_demissao date,
  status text NOT NULL DEFAULT 'ativo',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_contratos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_contr_select" ON public.hr_contratos FOR SELECT USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY "hr_contr_mutate" ON public.hr_contratos FOR ALL
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER trg_hr_contr_upd BEFORE UPDATE ON public.hr_contratos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.hr_contratos_set_numero()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('hr_contr:'||NEW.clinica_id::text));
    SELECT COALESCE(MAX(numero),0)+1 INTO NEW.numero FROM public.hr_contratos WHERE clinica_id = NEW.clinica_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_contr_num BEFORE INSERT ON public.hr_contratos FOR EACH ROW EXECUTE FUNCTION public.hr_contratos_set_numero();

-- HR ESCALAS
CREATE TABLE IF NOT EXISTS public.hr_escalas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  contrato_id uuid NOT NULL REFERENCES public.hr_contratos(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_entrada time,
  hora_saida time,
  intervalo_inicio time,
  intervalo_fim time,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contrato_id, dia_semana)
);
ALTER TABLE public.hr_escalas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_esc_select" ON public.hr_escalas FOR SELECT USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY "hr_esc_mutate" ON public.hr_escalas FOR ALL
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

-- HR PONTOS
CREATE TABLE IF NOT EXISTS public.hr_pontos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  contrato_id uuid REFERENCES public.hr_contratos(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('entrada','saida','intervalo_inicio','intervalo_fim')),
  marcado_em timestamptz NOT NULL DEFAULT now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  unidade_id uuid REFERENCES public.unidades(id) ON DELETE SET NULL,
  dentro_raio boolean,
  observacao text,
  ajustado boolean NOT NULL DEFAULT false,
  ajustado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_pontos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_ponto_select" ON public.hr_pontos FOR SELECT
  USING (user_id = auth.uid() OR public.can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY "hr_ponto_insert_self" ON public.hr_pontos FOR INSERT
  WITH CHECK ((user_id = auth.uid() AND public.is_member(auth.uid(), clinica_id))
              OR public.can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY "hr_ponto_update_manager" ON public.hr_pontos FOR UPDATE
  USING (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY "hr_ponto_delete_manager" ON public.hr_pontos FOR DELETE
  USING (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE INDEX IF NOT EXISTS idx_hr_pontos_user_data ON public.hr_pontos (user_id, marcado_em DESC);

-- HR BANCO HORAS
CREATE TABLE IF NOT EXISTS public.hr_banco_horas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  contrato_id uuid NOT NULL REFERENCES public.hr_contratos(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  horas_trabalhadas numeric(7,2) NOT NULL DEFAULT 0,
  horas_devidas numeric(7,2) NOT NULL DEFAULT 0,
  saldo numeric(7,2) NOT NULL DEFAULT 0,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contrato_id, competencia)
);
ALTER TABLE public.hr_banco_horas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_bh_select" ON public.hr_banco_horas FOR SELECT USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY "hr_bh_mutate" ON public.hr_banco_horas FOR ALL
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER trg_hr_bh_upd BEFORE UPDATE ON public.hr_banco_horas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- HR HOLERITES
CREATE TABLE IF NOT EXISTS public.hr_holerites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  contrato_id uuid NOT NULL REFERENCES public.hr_contratos(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  salario_base numeric(12,2) NOT NULL DEFAULT 0,
  proventos jsonb NOT NULL DEFAULT '[]'::jsonb,
  descontos jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_proventos numeric(12,2) NOT NULL DEFAULT 0,
  total_descontos numeric(12,2) NOT NULL DEFAULT 0,
  liquido numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'rascunho',
  pago_em date,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contrato_id, competencia)
);
ALTER TABLE public.hr_holerites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_hol_select" ON public.hr_holerites FOR SELECT
  USING (public.can_manage_clinica(auth.uid(), clinica_id)
         OR EXISTS (SELECT 1 FROM public.hr_contratos c WHERE c.id = hr_holerites.contrato_id AND c.user_id = auth.uid()));
CREATE POLICY "hr_hol_mutate" ON public.hr_holerites FOR ALL
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER trg_hr_hol_upd BEFORE UPDATE ON public.hr_holerites FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- HR FERIAS
CREATE TABLE IF NOT EXISTS public.hr_ferias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  contrato_id uuid NOT NULL REFERENCES public.hr_contratos(id) ON DELETE CASCADE,
  periodo_aquisitivo_inicio date NOT NULL,
  periodo_aquisitivo_fim date NOT NULL,
  inicio date,
  fim date,
  dias integer,
  abono_pecuniario boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'solicitada',
  aprovado_por uuid,
  aprovado_em timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_ferias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_fer_select" ON public.hr_ferias FOR SELECT
  USING (public.can_manage_clinica(auth.uid(), clinica_id)
         OR EXISTS (SELECT 1 FROM public.hr_contratos c WHERE c.id = hr_ferias.contrato_id AND c.user_id = auth.uid()));
CREATE POLICY "hr_fer_insert" ON public.hr_ferias FOR INSERT
  WITH CHECK (public.is_member(auth.uid(), clinica_id));
CREATE POLICY "hr_fer_mutate" ON public.hr_ferias FOR UPDATE
  USING (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY "hr_fer_delete" ON public.hr_ferias FOR DELETE
  USING (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER trg_hr_fer_upd BEFORE UPDATE ON public.hr_ferias FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
