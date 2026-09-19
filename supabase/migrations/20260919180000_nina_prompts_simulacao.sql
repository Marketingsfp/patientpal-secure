-- Biblioteca pessoal dos pedidos usados no planejamento Sol -> Luna.
-- Não cria testes, leads, mensagens nem execuções de IA.
BEGIN;
CREATE TABLE IF NOT EXISTS public.nina_carga_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pedido text NOT NULL CHECK (char_length(btrim(pedido)) BETWEEN 1 AND 6000),
  -- Hash só para deduplicação; não é credencial nem mecanismo de autorização.
  pedido_hash text GENERATED ALWAYS AS (md5(pedido)) STORED NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ultimo_usado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, user_id, pedido_hash)
);
ALTER TABLE public.nina_carga_prompts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nina_carga_prompts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.nina_carga_prompts TO authenticated;
GRANT INSERT (clinica_id, user_id, pedido, ultimo_usado_em),
  UPDATE (clinica_id, user_id, pedido, ultimo_usado_em)
  ON public.nina_carga_prompts TO authenticated;
GRANT ALL ON public.nina_carga_prompts TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='nina_carga_prompts' AND policyname='prompts_proprios') THEN
    CREATE POLICY prompts_proprios ON public.nina_carga_prompts
      FOR ALL TO authenticated
      USING (user_id = auth.uid() AND public.is_member(auth.uid(), clinica_id))
      WITH CHECK (user_id = auth.uid() AND public.is_member(auth.uid(), clinica_id));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS nina_carga_prompts_recentes_idx
  ON public.nina_carga_prompts (clinica_id, user_id, ultimo_usado_em DESC, id);
COMMENT ON TABLE public.nina_carga_prompts IS
  'Prompts pessoais para reutilização no planejamento de simulações. Sem geração ou disparo automático ao selecionar.';
NOTIFY pgrst, 'reload schema';
COMMIT;
