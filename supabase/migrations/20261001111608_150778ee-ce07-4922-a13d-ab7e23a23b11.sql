-- Avaliações corporais
CREATE TABLE public.paciente_avaliacoes_corporais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  data date NOT NULL DEFAULT current_date,
  peso_kg numeric(6,2),
  altura_cm numeric(6,2),
  imc numeric(6,2) GENERATED ALWAYS AS (
    CASE WHEN peso_kg > 0 AND altura_cm > 0 THEN round(peso_kg / ((altura_cm/100.0)^2), 2) END
  ) STORED,
  cintura_cm numeric(6,2),
  quadril_cm numeric(6,2),
  abdomen_cm numeric(6,2),
  braco_cm numeric(6,2),
  coxa_cm numeric(6,2),
  gordura_pct numeric(5,2),
  pa_sistolica integer,
  pa_diastolica integer,
  observacao text,
  profissional_nome text,
  criado_por uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pac_aval_corp ON public.paciente_avaliacoes_corporais (clinica_id, paciente_id, data);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paciente_avaliacoes_corporais TO authenticated;
GRANT ALL ON public.paciente_avaliacoes_corporais TO service_role;
ALTER TABLE public.paciente_avaliacoes_corporais ENABLE ROW LEVEL SECURITY;
CREATE POLICY aval_corp_select ON public.paciente_avaliacoes_corporais FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY aval_corp_insert ON public.paciente_avaliacoes_corporais FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','medico','enfermeiro']::app_role[]));
CREATE POLICY aval_corp_update ON public.paciente_avaliacoes_corporais FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','medico','enfermeiro']::app_role[]));
CREATE POLICY aval_corp_delete ON public.paciente_avaliacoes_corporais FOR DELETE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER trg_aval_corp_updated BEFORE UPDATE ON public.paciente_avaliacoes_corporais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Alertas do paciente
CREATE TABLE public.paciente_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('alergia','clinico','administrativo')),
  descricao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid DEFAULT auth.uid(),
  criado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pac_alertas ON public.paciente_alertas (clinica_id, paciente_id) WHERE ativo;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paciente_alertas TO authenticated;
GRANT ALL ON public.paciente_alertas TO service_role;
ALTER TABLE public.paciente_alertas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pac_alertas_select ON public.paciente_alertas FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY pac_alertas_insert ON public.paciente_alertas FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','medico','enfermeiro','recepcao']::app_role[]));
CREATE POLICY pac_alertas_update ON public.paciente_alertas FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','medico','enfermeiro','recepcao']::app_role[]));
CREATE POLICY pac_alertas_delete ON public.paciente_alertas FOR DELETE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER trg_pac_alertas_updated BEFORE UPDATE ON public.paciente_alertas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Anexos e fotos
CREATE TABLE public.paciente_arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('anexo','foto')),
  caminho text NOT NULL,
  nome_arquivo text NOT NULL,
  mime text,
  tamanho_bytes bigint,
  descricao text,
  data date NOT NULL DEFAULT current_date,
  enviado_por uuid DEFAULT auth.uid(),
  enviado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pac_arquivos ON public.paciente_arquivos (clinica_id, paciente_id, tipo);
GRANT SELECT, INSERT, DELETE ON public.paciente_arquivos TO authenticated;
GRANT ALL ON public.paciente_arquivos TO service_role;
ALTER TABLE public.paciente_arquivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pac_arq_select ON public.paciente_arquivos FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY pac_arq_insert ON public.paciente_arquivos FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), clinica_id) AND caminho LIKE clinica_id::text || '/%');
CREATE POLICY pac_arq_delete ON public.paciente_arquivos FOR DELETE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

-- Tags no prontuário
ALTER TABLE public.prontuarios ADD COLUMN IF NOT EXISTS tags text[];

-- Storage: pasta privada paciente-arquivos (criada pela ferramenta), caminho {clinica}/{paciente}/...
CREATE POLICY pac_arq_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'paciente-arquivos' AND public.is_member(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY pac_arq_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'paciente-arquivos' AND public.is_member(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY pac_arq_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'paciente-arquivos' AND public.can_manage_clinica(auth.uid(), ((storage.foldername(name))[1])::uuid));