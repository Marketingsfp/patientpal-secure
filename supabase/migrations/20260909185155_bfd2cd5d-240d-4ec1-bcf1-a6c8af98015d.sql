ALTER TABLE public.atend_conversas
  ADD COLUMN IF NOT EXISTS whatsapp_profile_name text NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_profile_name_updated_at timestamptz NULL;

COMMENT ON COLUMN public.atend_conversas.whatsapp_profile_name IS 'Identidade do contato WhatsApp (value.contacts[].profile.name). Nunca vem de pacientes.nome.';
COMMENT ON COLUMN public.atend_conversas.whatsapp_profile_name_updated_at IS 'Quando o nome de perfil do WhatsApp foi atualizado pela ultima vez.';