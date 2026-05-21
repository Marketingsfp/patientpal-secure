-- Tabela de configuração do WhatsApp por clínica
CREATE TABLE public.whatsapp_configs (
  clinica_id uuid PRIMARY KEY REFERENCES public.clinicas(id) ON DELETE CASCADE,
  phone_number_id text,
  waba_id text,
  display_phone_number text,
  display_name text,
  access_token text,
  app_secret text,
  verify_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  welcome_message text DEFAULT 'Olá! Sou a Nina 💚, assistente virtual da clínica. Posso te ajudar a agendar, confirmar ou tirar dúvidas.',
  horario_inicio time DEFAULT '08:00',
  horario_fim time DEFAULT '18:00',
  ativo boolean NOT NULL DEFAULT false,
  ultimo_teste_em timestamptz,
  ultimo_teste_ok boolean,
  ultimo_teste_erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_whatsapp_configs_touch
BEFORE UPDATE ON public.whatsapp_configs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.whatsapp_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "WhatsApp config: gestores leem"
ON public.whatsapp_configs FOR SELECT TO authenticated
USING (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "WhatsApp config: gestores inserem"
ON public.whatsapp_configs FOR INSERT TO authenticated
WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "WhatsApp config: gestores atualizam"
ON public.whatsapp_configs FOR UPDATE TO authenticated
USING (public.can_manage_clinica(auth.uid(), clinica_id))
WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "WhatsApp config: gestores apagam"
ON public.whatsapp_configs FOR DELETE TO authenticated
USING (public.can_manage_clinica(auth.uid(), clinica_id));

-- Tabela de mensagens trocadas via WhatsApp
CREATE TABLE public.whatsapp_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  wa_message_id text,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  from_number text,
  to_number text,
  body text,
  tipo text NOT NULL DEFAULT 'text',
  status text,
  enviada_por text CHECK (enviada_por IN ('paciente', 'nina', 'humano')),
  raw jsonb,
  recebida_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_mensagens_clinica_data ON public.whatsapp_mensagens(clinica_id, recebida_em DESC);
CREATE INDEX idx_whatsapp_mensagens_from ON public.whatsapp_mensagens(clinica_id, from_number, recebida_em DESC);
CREATE UNIQUE INDEX idx_whatsapp_mensagens_wa_id ON public.whatsapp_mensagens(wa_message_id) WHERE wa_message_id IS NOT NULL;

ALTER TABLE public.whatsapp_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "WhatsApp msgs: membros leem"
ON public.whatsapp_mensagens FOR SELECT TO authenticated
USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY "WhatsApp msgs: atendentes inserem"
ON public.whatsapp_mensagens FOR INSERT TO authenticated
WITH CHECK (public.is_member(auth.uid(), clinica_id));