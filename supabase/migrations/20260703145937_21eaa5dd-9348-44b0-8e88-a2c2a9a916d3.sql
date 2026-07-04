CREATE UNIQUE INDEX IF NOT EXISTS cb_convenios_clinica_nome_uidx
  ON public.cb_convenios (clinica_id, lower(nome));