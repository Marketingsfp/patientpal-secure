CREATE TABLE IF NOT EXISTS public.clinica_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  flag_key text NOT NULL,
  ativo boolean NOT NULL DEFAULT false,
  descricao text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, flag_key)
);

CREATE INDEX IF NOT EXISTS idx_clinica_feature_flags_clinica ON public.clinica_feature_flags(clinica_id);
CREATE INDEX IF NOT EXISTS idx_clinica_feature_flags_key ON public.clinica_feature_flags(flag_key);

GRANT SELECT ON public.clinica_feature_flags TO authenticated;
GRANT ALL ON public.clinica_feature_flags TO service_role;

ALTER TABLE public.clinica_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros leem flags da propria clinica"
  ON public.clinica_feature_flags FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY "Admin/Gestor inserem flags"
  ON public.clinica_feature_flags FOR INSERT TO authenticated
  WITH CHECK (
    public.is_member(auth.uid(), clinica_id)
    AND (
      public.has_role(auth.uid(), clinica_id, 'admin'::public.app_role)
      OR public.has_role(auth.uid(), clinica_id, 'gestor'::public.app_role)
    )
  );

CREATE POLICY "Admin/Gestor atualizam flags"
  ON public.clinica_feature_flags FOR UPDATE TO authenticated
  USING (
    public.is_member(auth.uid(), clinica_id)
    AND (
      public.has_role(auth.uid(), clinica_id, 'admin'::public.app_role)
      OR public.has_role(auth.uid(), clinica_id, 'gestor'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_member(auth.uid(), clinica_id)
    AND (
      public.has_role(auth.uid(), clinica_id, 'admin'::public.app_role)
      OR public.has_role(auth.uid(), clinica_id, 'gestor'::public.app_role)
    )
  );

CREATE POLICY "Admin/Gestor excluem flags"
  ON public.clinica_feature_flags FOR DELETE TO authenticated
  USING (
    public.is_member(auth.uid(), clinica_id)
    AND (
      public.has_role(auth.uid(), clinica_id, 'admin'::public.app_role)
      OR public.has_role(auth.uid(), clinica_id, 'gestor'::public.app_role)
    )
  );

CREATE OR REPLACE FUNCTION public.tg_clinica_feature_flags_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_clinica_feature_flags_updated_at ON public.clinica_feature_flags;
CREATE TRIGGER trg_clinica_feature_flags_updated_at
  BEFORE UPDATE ON public.clinica_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.tg_clinica_feature_flags_updated_at();

CREATE OR REPLACE FUNCTION public.feature_flag_ativa(_clinica_id uuid, _flag_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT ativo FROM public.clinica_feature_flags
     WHERE clinica_id = _clinica_id AND flag_key = _flag_key LIMIT 1),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.feature_flag_ativa(uuid, text) TO authenticated;