
-- clinica_tts_config: restringir por membership/gestão
DROP POLICY IF EXISTS tts_config_select_all ON public.clinica_tts_config;
DROP POLICY IF EXISTS tts_config_write_authenticated ON public.clinica_tts_config;

CREATE POLICY tts_config_select_members ON public.clinica_tts_config
  FOR SELECT TO authenticated
  USING (is_member(auth.uid(), clinica_id));

CREATE POLICY tts_config_insert_managers ON public.clinica_tts_config
  FOR INSERT TO authenticated
  WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY tts_config_update_managers ON public.clinica_tts_config
  FOR UPDATE TO authenticated
  USING (can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY tts_config_delete_managers ON public.clinica_tts_config
  FOR DELETE TO authenticated
  USING (can_manage_clinica(auth.uid(), clinica_id));

-- chat_canais
ALTER POLICY canais_select ON public.chat_canais TO authenticated;
ALTER POLICY canais_insert ON public.chat_canais TO authenticated;
ALTER POLICY canais_update ON public.chat_canais TO authenticated;
ALTER POLICY canais_delete ON public.chat_canais TO authenticated;

-- chat_membros
ALTER POLICY membros_select ON public.chat_membros TO authenticated;
ALTER POLICY membros_delete ON public.chat_membros TO authenticated;

-- chat_mensagens
ALTER POLICY msg_insert ON public.chat_mensagens TO authenticated;
ALTER POLICY msg_update ON public.chat_mensagens TO authenticated;
ALTER POLICY msg_delete ON public.chat_mensagens TO authenticated;

-- chat_leituras
ALTER POLICY leit_select ON public.chat_leituras TO authenticated;
ALTER POLICY leit_update ON public.chat_leituras TO authenticated;
ALTER POLICY leit_upsert ON public.chat_leituras TO authenticated;

-- especialidades
ALTER POLICY especialidades_manager_delete ON public.especialidades TO authenticated;
ALTER POLICY especialidades_manager_update ON public.especialidades TO authenticated;

-- prestadores
ALTER POLICY prest_update ON public.prestadores TO authenticated;
