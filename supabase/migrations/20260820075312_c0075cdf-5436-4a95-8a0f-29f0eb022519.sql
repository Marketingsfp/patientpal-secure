-- 1. TTS config: remover leitura anônima ampla, expor via função restrita
DROP POLICY IF EXISTS tts_config_select_publico ON public.clinica_tts_config;
REVOKE SELECT ON public.clinica_tts_config FROM anon;

CREATE OR REPLACE FUNCTION public.tts_config_publico(_clinica_id uuid)
RETURNS TABLE (rate numeric, enabled boolean, piper_voice text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.rate, c.enabled, c.piper_voice
  FROM public.clinica_tts_config c
  WHERE c.clinica_id = _clinica_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.tts_config_publico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tts_config_publico(uuid) TO anon, authenticated, service_role;

-- 2. chat_membros: restringir quem pode ser adicionado
DROP POLICY IF EXISTS membros_insert ON public.chat_membros;

CREATE POLICY membros_insert ON public.chat_membros
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_canais c
      WHERE c.id = chat_membros.canal_id
        AND public.is_member(auth.uid(), c.clinica_id)
        AND (
          -- entrada por conta própria
          chat_membros.user_id = auth.uid()
          -- ou o criador adiciona alguém que é membro ativo da mesma clínica
          OR (
            c.criado_por = auth.uid()
            AND public.is_member(chat_membros.user_id, c.clinica_id)
          )
        )
    )
  );