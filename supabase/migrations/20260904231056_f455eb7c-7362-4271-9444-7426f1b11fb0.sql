CREATE TABLE public.atend_respostas_rapidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  comando text NOT NULL,
  nome text NOT NULL,
  conteudo text NOT NULL,
  categoria text,
  ativo boolean NOT NULL DEFAULT true,
  escopo text NOT NULL DEFAULT 'clinica',
  owner_user_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atend_rr_escopo_chk CHECK (escopo IN ('clinica','pessoal')),
  CONSTRAINT atend_rr_owner_chk CHECK ((escopo = 'pessoal' AND owner_user_id IS NOT NULL) OR (escopo = 'clinica' AND owner_user_id IS NULL)),
  CONSTRAINT atend_rr_comando_chk CHECK (comando ~ '^[a-z0-9_]{1,40}$')
);

CREATE UNIQUE INDEX atend_rr_unq_clinica ON public.atend_respostas_rapidas (clinica_id, comando) WHERE ativo AND escopo = 'clinica';
CREATE UNIQUE INDEX atend_rr_unq_pessoal ON public.atend_respostas_rapidas (clinica_id, owner_user_id, comando) WHERE ativo AND escopo = 'pessoal';
CREATE INDEX atend_rr_clinica_idx ON public.atend_respostas_rapidas (clinica_id, ativo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_respostas_rapidas TO authenticated;
GRANT ALL ON public.atend_respostas_rapidas TO service_role;
ALTER TABLE public.atend_respostas_rapidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY rr_select ON public.atend_respostas_rapidas FOR SELECT TO authenticated
  USING (is_member(auth.uid(), clinica_id) AND (escopo = 'clinica' OR owner_user_id = auth.uid()));
CREATE POLICY rr_insert ON public.atend_respostas_rapidas FOR INSERT TO authenticated
  WITH CHECK (is_member(auth.uid(), clinica_id) AND (escopo = 'clinica' OR owner_user_id = auth.uid()));
CREATE POLICY rr_update ON public.atend_respostas_rapidas FOR UPDATE TO authenticated
  USING (is_member(auth.uid(), clinica_id) AND (escopo = 'clinica' OR owner_user_id = auth.uid()))
  WITH CHECK (is_member(auth.uid(), clinica_id) AND (escopo = 'clinica' OR owner_user_id = auth.uid()));
CREATE POLICY rr_delete ON public.atend_respostas_rapidas FOR DELETE TO authenticated
  USING (is_member(auth.uid(), clinica_id) AND (escopo = 'clinica' OR owner_user_id = auth.uid()));

CREATE TRIGGER atend_rr_touch BEFORE UPDATE ON public.atend_respostas_rapidas
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE TABLE public.atend_resposta_favoritos (
  resposta_id uuid NOT NULL REFERENCES public.atend_respostas_rapidas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  clinica_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resposta_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.atend_resposta_favoritos TO authenticated;
GRANT ALL ON public.atend_resposta_favoritos TO service_role;
ALTER TABLE public.atend_resposta_favoritos ENABLE ROW LEVEL SECURITY;

CREATE POLICY rrf_own ON public.atend_resposta_favoritos FOR ALL TO authenticated
  USING (user_id = auth.uid() AND is_member(auth.uid(), clinica_id))
  WITH CHECK (user_id = auth.uid() AND is_member(auth.uid(), clinica_id));

CREATE TABLE public.atend_resposta_usos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  resposta_id uuid REFERENCES public.atend_respostas_rapidas(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  conversa_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX atend_rru_user_idx ON public.atend_resposta_usos (clinica_id, user_id, created_at DESC);

GRANT SELECT, INSERT ON public.atend_resposta_usos TO authenticated;
GRANT ALL ON public.atend_resposta_usos TO service_role;
ALTER TABLE public.atend_resposta_usos ENABLE ROW LEVEL SECURITY;

CREATE POLICY rru_select ON public.atend_resposta_usos FOR SELECT TO authenticated
  USING (is_member(auth.uid(), clinica_id));
CREATE POLICY rru_insert ON public.atend_resposta_usos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_member(auth.uid(), clinica_id));