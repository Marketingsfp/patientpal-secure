-- Fix: CRM observacoes was being uppercased by the global trigger
DROP TRIGGER IF EXISTS tg_uppercase_text_fields ON public.crm_oportunidades;

-- Fix: reject blank names and invalid emails at the database level
ALTER TABLE public.crm_oportunidades
  ADD CONSTRAINT crm_oportunidades_nome_lead_nonempty
  CHECK (char_length(btrim(nome_lead)) BETWEEN 2 AND 120);

ALTER TABLE public.crm_oportunidades
  ADD CONSTRAINT crm_oportunidades_email_formato
  CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
