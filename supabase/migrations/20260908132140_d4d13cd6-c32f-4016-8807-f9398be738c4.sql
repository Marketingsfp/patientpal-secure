REVOKE ALL ON FUNCTION public.atend_presenca_redistribui() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atend_pausa_fim_redistribui() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atend_distribuir_fila_interno(uuid, integer) FROM PUBLIC, anon, authenticated;