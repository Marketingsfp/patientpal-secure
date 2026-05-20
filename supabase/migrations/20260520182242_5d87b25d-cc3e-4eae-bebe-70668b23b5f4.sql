
-- Tipo de canal
DO $$ BEGIN
  CREATE TYPE public.chat_canal_tipo AS ENUM ('direto','grupo','setor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Canais
CREATE TABLE public.chat_canais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  tipo public.chat_canal_tipo NOT NULL DEFAULT 'grupo',
  nome text,
  setor_id uuid,
  criado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_canais_clinica ON public.chat_canais(clinica_id);

-- Membros
CREATE TABLE public.chat_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal_id uuid NOT NULL REFERENCES public.chat_canais(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  papel text NOT NULL DEFAULT 'membro',
  silenciado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(canal_id, user_id)
);

CREATE INDEX idx_chat_membros_user ON public.chat_membros(user_id);
CREATE INDEX idx_chat_membros_canal ON public.chat_membros(canal_id);

-- Mensagens
CREATE TABLE public.chat_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal_id uuid NOT NULL REFERENCES public.chat_canais(id) ON DELETE CASCADE,
  clinica_id uuid NOT NULL,
  autor_id uuid NOT NULL,
  texto text,
  anexo_url text,
  anexo_tipo text,
  reply_to uuid REFERENCES public.chat_mensagens(id) ON DELETE SET NULL,
  editada_em timestamptz,
  deletada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_msg_canal ON public.chat_mensagens(canal_id, created_at DESC);

-- Leituras (última mensagem lida por usuário/canal)
CREATE TABLE public.chat_leituras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal_id uuid NOT NULL REFERENCES public.chat_canais(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  ultima_lida_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(canal_id, user_id)
);

-- Função helper: é membro do canal?
CREATE OR REPLACE FUNCTION public.is_chat_member(_user_id uuid, _canal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_membros WHERE user_id = _user_id AND canal_id = _canal_id)
$$;

-- RLS
ALTER TABLE public.chat_canais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_leituras ENABLE ROW LEVEL SECURITY;

-- chat_canais: ver se for membro da clínica; criar se for membro
CREATE POLICY canais_select ON public.chat_canais FOR SELECT
  USING (is_member(auth.uid(), clinica_id));
CREATE POLICY canais_insert ON public.chat_canais FOR INSERT
  WITH CHECK (is_member(auth.uid(), clinica_id) AND criado_por = auth.uid());
CREATE POLICY canais_update ON public.chat_canais FOR UPDATE
  USING (is_member(auth.uid(), clinica_id))
  WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY canais_delete ON public.chat_canais FOR DELETE
  USING (criado_por = auth.uid() OR can_manage_clinica(auth.uid(), clinica_id));

-- chat_membros: ver membros de canais que sou membro
CREATE POLICY membros_select ON public.chat_membros FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_chat_member(auth.uid(), canal_id)
  );
CREATE POLICY membros_insert ON public.chat_membros FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_canais c
      WHERE c.id = canal_id AND is_member(auth.uid(), c.clinica_id)
    )
  );
CREATE POLICY membros_delete ON public.chat_membros FOR DELETE
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.chat_canais c WHERE c.id = canal_id AND c.criado_por = auth.uid()
  ));

-- chat_mensagens
CREATE POLICY msg_select ON public.chat_mensagens FOR SELECT
  USING (is_chat_member(auth.uid(), canal_id));
CREATE POLICY msg_insert ON public.chat_mensagens FOR INSERT
  WITH CHECK (autor_id = auth.uid() AND is_chat_member(auth.uid(), canal_id));
CREATE POLICY msg_update ON public.chat_mensagens FOR UPDATE
  USING (autor_id = auth.uid()) WITH CHECK (autor_id = auth.uid());
CREATE POLICY msg_delete ON public.chat_mensagens FOR DELETE
  USING (autor_id = auth.uid());

-- chat_leituras
CREATE POLICY leit_select ON public.chat_leituras FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY leit_upsert ON public.chat_leituras FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY leit_update ON public.chat_leituras FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_canais;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_membros;

-- Trigger touch updated_at
CREATE TRIGGER trg_chat_canais_touch BEFORE UPDATE ON public.chat_canais
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
