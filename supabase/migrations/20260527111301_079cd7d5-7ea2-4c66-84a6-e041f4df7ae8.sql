-- =====================================================
-- MÓDULO ATENDIMENTO — FASE 1: Schema base
-- =====================================================

-- 1) Departamentos
CREATE TABLE public.atend_departamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  distribuicao text NOT NULL DEFAULT 'manual' CHECK (distribuicao IN ('manual','round_robin','menor_carga')),
  prioridade integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_departamentos TO authenticated;
GRANT ALL ON public.atend_departamentos TO service_role;
ALTER TABLE public.atend_departamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dep_select" ON public.atend_departamentos FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "dep_cud" ON public.atend_departamentos FOR ALL TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id)) WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER trg_dep_touch BEFORE UPDATE ON public.atend_departamentos FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 2) Membros de departamento
CREATE TABLE public.atend_departamento_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  departamento_id uuid NOT NULL REFERENCES public.atend_departamentos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'agente' CHECK (role IN ('agente','supervisor','gestor','admin')),
  queue_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (departamento_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_departamento_membros TO authenticated;
GRANT ALL ON public.atend_departamento_membros TO service_role;
ALTER TABLE public.atend_departamento_membros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dm_select" ON public.atend_departamento_membros FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "dm_self_update" ON public.atend_departamento_membros FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "dm_cud" ON public.atend_departamento_membros FOR ALL TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id)) WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

-- 3) Conversas (agrupa as mensagens existentes em whatsapp_mensagens por telefone+canal)
CREATE TABLE public.atend_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  canal text NOT NULL DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp','instagram','facebook','webchat')),
  contato_telefone text,
  contato_nome text,
  contato_paciente_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'bot_attending' CHECK (status IN ('bot_attending','active','waiting','closed','finished')),
  departamento_id uuid REFERENCES public.atend_departamentos(id) ON DELETE SET NULL,
  atribuida_user_id uuid,
  fila_posicao integer,
  aguardando_desde timestamptz,
  ultima_msg_em timestamptz NOT NULL DEFAULT now(),
  ultima_msg_preview text,
  janela_24h_em timestamptz,
  unread_count integer NOT NULL DEFAULT 0,
  protocol_number text,
  closed_at timestamptz,
  sentimento text CHECK (sentimento IN ('positivo','neutro','negativo','frustrado')),
  sentimento_score numeric(4,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, canal, contato_telefone)
);
CREATE INDEX idx_atend_conv_clinica_status ON public.atend_conversas (clinica_id, status, ultima_msg_em DESC);
CREATE INDEX idx_atend_conv_atribuida ON public.atend_conversas (clinica_id, atribuida_user_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_conversas TO authenticated;
GRANT ALL ON public.atend_conversas TO service_role;
ALTER TABLE public.atend_conversas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conv_select" ON public.atend_conversas FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "conv_cud" ON public.atend_conversas FOR ALL TO authenticated USING (is_member(auth.uid(), clinica_id)) WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE TRIGGER trg_conv_touch BEFORE UPDATE ON public.atend_conversas FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.atend_conversas;

-- 4) Notas internas
CREATE TABLE public.atend_notas_internas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  conversa_id uuid NOT NULL REFERENCES public.atend_conversas(id) ON DELETE CASCADE,
  autor_user_id uuid NOT NULL,
  autor_nome text,
  conteudo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_notas_internas TO authenticated;
GRANT ALL ON public.atend_notas_internas TO service_role;
ALTER TABLE public.atend_notas_internas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notas_all" ON public.atend_notas_internas FOR ALL TO authenticated USING (is_member(auth.uid(), clinica_id)) WITH CHECK (is_member(auth.uid(), clinica_id));

-- 5) Avaliações de conversa (CSAT do paciente)
CREATE TABLE public.atend_avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  conversa_id uuid NOT NULL REFERENCES public.atend_conversas(id) ON DELETE CASCADE,
  nota integer NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_avaliacoes TO authenticated;
GRANT ALL ON public.atend_avaliacoes TO service_role;
ALTER TABLE public.atend_avaliacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "av_all" ON public.atend_avaliacoes FOR ALL TO authenticated USING (is_member(auth.uid(), clinica_id)) WITH CHECK (is_member(auth.uid(), clinica_id));

-- 6) Motivos de pausa do agente
CREATE TABLE public.atend_pause_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cor text DEFAULT '#6b7280',
  icone text,
  tolerancia_minutos integer NOT NULL DEFAULT 5,
  conta_trabalhado boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_pause_reasons TO authenticated;
GRANT ALL ON public.atend_pause_reasons TO service_role;
ALTER TABLE public.atend_pause_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pr_select" ON public.atend_pause_reasons FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "pr_cud" ON public.atend_pause_reasons FOR ALL TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id)) WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

-- 7) Log de pausas
CREATE TABLE public.atend_pausas_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reason_id uuid REFERENCES public.atend_pause_reasons(id) ON DELETE SET NULL,
  iniciada_em timestamptz NOT NULL DEFAULT now(),
  finalizada_em timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_pausas_log TO authenticated;
GRANT ALL ON public.atend_pausas_log TO service_role;
ALTER TABLE public.atend_pausas_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pl_self" ON public.atend_pausas_log FOR ALL TO authenticated USING (user_id = auth.uid() OR can_manage_clinica(auth.uid(), clinica_id)) WITH CHECK (user_id = auth.uid() OR can_manage_clinica(auth.uid(), clinica_id));

-- 8) Base de conhecimento
CREATE TABLE public.atend_kb (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  conteudo text NOT NULL,
  categoria text,
  tags text[] DEFAULT '{}',
  publicado boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_kb TO authenticated;
GRANT ALL ON public.atend_kb TO service_role;
ALTER TABLE public.atend_kb ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_select" ON public.atend_kb FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "kb_cud" ON public.atend_kb FOR ALL TO authenticated USING (is_member(auth.uid(), clinica_id)) WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE TRIGGER trg_kb_touch BEFORE UPDATE ON public.atend_kb FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 9) Macros / modelos de mensagem
CREATE TABLE public.atend_macros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  atalho text NOT NULL,
  titulo text NOT NULL,
  conteudo text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, atalho)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_macros TO authenticated;
GRANT ALL ON public.atend_macros TO service_role;
ALTER TABLE public.atend_macros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mac_all" ON public.atend_macros FOR ALL TO authenticated USING (is_member(auth.uid(), clinica_id)) WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE TRIGGER trg_mac_touch BEFORE UPDATE ON public.atend_macros FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 10) Bot configs (1 por departamento, ou geral quando depto = NULL)
CREATE TABLE public.atend_bot_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  departamento_id uuid REFERENCES public.atend_departamentos(id) ON DELETE CASCADE,
  bot_type text NOT NULL DEFAULT 'ai' CHECK (bot_type IN ('menu','ai','both')),
  welcome_message text,
  menu_options jsonb DEFAULT '[]'::jsonb,
  ai_prompt text,
  ai_model text DEFAULT 'google/gemini-3-flash-preview',
  max_ai_interactions integer NOT NULL DEFAULT 5,
  fallback_departamento_id uuid REFERENCES public.atend_departamentos(id) ON DELETE SET NULL,
  flow_definition jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, departamento_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_bot_configs TO authenticated;
GRANT ALL ON public.atend_bot_configs TO service_role;
ALTER TABLE public.atend_bot_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bot_select" ON public.atend_bot_configs FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "bot_cud" ON public.atend_bot_configs FOR ALL TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id)) WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER trg_bot_touch BEFORE UPDATE ON public.atend_bot_configs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 11) Horários de atendimento
CREATE TABLE public.atend_horarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio time NOT NULL,
  hora_fim time NOT NULL,
  canal text NOT NULL DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp','telefonia','todos')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_horarios TO authenticated;
GRANT ALL ON public.atend_horarios TO service_role;
ALTER TABLE public.atend_horarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hor_select" ON public.atend_horarios FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "hor_cud" ON public.atend_horarios FOR ALL TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id)) WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

-- 12) Mensagem fora de horário
CREATE TABLE public.atend_msg_fora_horario (
  clinica_id uuid PRIMARY KEY REFERENCES public.clinicas(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT false,
  mensagem text NOT NULL DEFAULT 'No momento estamos fora do horário de atendimento. Retornaremos seu contato no próximo expediente.',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_msg_fora_horario TO authenticated;
GRANT ALL ON public.atend_msg_fora_horario TO service_role;
ALTER TABLE public.atend_msg_fora_horario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mfh_select" ON public.atend_msg_fora_horario FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "mfh_cud" ON public.atend_msg_fora_horario FOR ALL TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id)) WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

-- 13) Números autorizados (whitelist para testes)
CREATE TABLE public.atend_numeros_autorizados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  telefone text NOT NULL,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, telefone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_numeros_autorizados TO authenticated;
GRANT ALL ON public.atend_numeros_autorizados TO service_role;
ALTER TABLE public.atend_numeros_autorizados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "na_select" ON public.atend_numeros_autorizados FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "na_cud" ON public.atend_numeros_autorizados FOR ALL TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id)) WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

-- 14) Configuração de protocolo
CREATE TABLE public.atend_protocolo_config (
  clinica_id uuid PRIMARY KEY REFERENCES public.clinicas(id) ON DELETE CASCADE,
  prefixo text NOT NULL DEFAULT 'ATD',
  formato text NOT NULL DEFAULT 'ANO-SEQ' CHECK (formato IN ('ANO-SEQ','ANOMES-SEQ','SEQ')),
  proximo_seq integer NOT NULL DEFAULT 1,
  zerar_anualmente boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_protocolo_config TO authenticated;
GRANT ALL ON public.atend_protocolo_config TO service_role;
ALTER TABLE public.atend_protocolo_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pc_select" ON public.atend_protocolo_config FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "pc_cud" ON public.atend_protocolo_config FOR ALL TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id)) WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

-- 15) Transferências de conversa
CREATE TABLE public.atend_transferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  conversa_id uuid NOT NULL REFERENCES public.atend_conversas(id) ON DELETE CASCADE,
  de_user_id uuid,
  para_user_id uuid,
  de_departamento_id uuid,
  para_departamento_id uuid,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_transferencias TO authenticated;
GRANT ALL ON public.atend_transferencias TO service_role;
ALTER TABLE public.atend_transferencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tr_all" ON public.atend_transferencias FOR ALL TO authenticated USING (is_member(auth.uid(), clinica_id)) WITH CHECK (is_member(auth.uid(), clinica_id));

-- =====================================================
-- LIGAR whatsapp_mensagens às conversas
-- =====================================================
ALTER TABLE public.whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS conversa_id uuid REFERENCES public.atend_conversas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS quoted_message_id text,
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_mime text,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_wa_msg_conversa ON public.whatsapp_mensagens (conversa_id, recebida_em);

-- =====================================================
-- FUNÇÃO: gerar protocolo
-- =====================================================
CREATE OR REPLACE FUNCTION public.atend_gerar_protocolo(_clinica_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cfg record;
  _seq integer;
  _ano text;
  _mes text;
  _result text;
BEGIN
  IF NOT is_member(auth.uid(), _clinica_id) THEN
    RAISE EXCEPTION 'Sem acesso';
  END IF;
  -- garante row de config
  INSERT INTO public.atend_protocolo_config (clinica_id) VALUES (_clinica_id)
    ON CONFLICT (clinica_id) DO NOTHING;
  PERFORM pg_advisory_xact_lock(hashtext('atend_protocolo:'||_clinica_id::text));
  SELECT * INTO _cfg FROM public.atend_protocolo_config WHERE clinica_id = _clinica_id;
  _seq := _cfg.proximo_seq;
  _ano := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY');
  _mes := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'MM');
  IF _cfg.formato = 'ANO-SEQ' THEN
    _result := _cfg.prefixo || '-' || _ano || '-' || lpad(_seq::text, 6, '0');
  ELSIF _cfg.formato = 'ANOMES-SEQ' THEN
    _result := _cfg.prefixo || '-' || _ano || _mes || '-' || lpad(_seq::text, 5, '0');
  ELSE
    _result := _cfg.prefixo || '-' || lpad(_seq::text, 8, '0');
  END IF;
  UPDATE public.atend_protocolo_config SET proximo_seq = _seq + 1, updated_at = now() WHERE clinica_id = _clinica_id;
  RETURN _result;
END;
$$;

-- =====================================================
-- FUNÇÃO: garantir conversa ao inserir mensagem
-- =====================================================
CREATE OR REPLACE FUNCTION public.atend_ensure_conversa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _telefone text;
  _conv_id uuid;
  _now timestamptz := now();
BEGIN
  _telefone := CASE WHEN NEW.direction = 'in' THEN NEW.from_number ELSE NEW.to_number END;
  IF _telefone IS NULL OR length(_telefone) < 5 THEN
    RETURN NEW;
  END IF;
  SELECT id INTO _conv_id FROM public.atend_conversas
    WHERE clinica_id = NEW.clinica_id AND canal = COALESCE(NEW.canal,'whatsapp') AND contato_telefone = _telefone
    LIMIT 1;
  IF _conv_id IS NULL THEN
    INSERT INTO public.atend_conversas (clinica_id, canal, contato_telefone, contato_nome, status, ultima_msg_em, ultima_msg_preview, janela_24h_em, unread_count)
    VALUES (NEW.clinica_id, COALESCE(NEW.canal,'whatsapp'), _telefone, _telefone, 'bot_attending', _now,
            COALESCE(NEW.body, '['||NEW.tipo||']'),
            CASE WHEN NEW.direction = 'in' THEN _now ELSE NULL END,
            CASE WHEN NEW.direction = 'in' THEN 1 ELSE 0 END)
    RETURNING id INTO _conv_id;
  ELSE
    UPDATE public.atend_conversas SET
      ultima_msg_em = _now,
      ultima_msg_preview = COALESCE(NEW.body, '['||NEW.tipo||']'),
      janela_24h_em = CASE WHEN NEW.direction = 'in' THEN _now ELSE janela_24h_em END,
      unread_count = CASE WHEN NEW.direction = 'in' THEN unread_count + 1 ELSE unread_count END,
      updated_at = _now
    WHERE id = _conv_id;
  END IF;
  NEW.conversa_id := _conv_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atend_ensure_conv ON public.whatsapp_mensagens;
CREATE TRIGGER trg_atend_ensure_conv BEFORE INSERT ON public.whatsapp_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.atend_ensure_conversa();

-- =====================================================
-- BACKFILL: criar conversas para mensagens existentes
-- =====================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT clinica_id,
           COALESCE(NULLIF(CASE WHEN direction='in' THEN from_number ELSE to_number END,''), '') AS telefone
    FROM public.whatsapp_mensagens
    WHERE conversa_id IS NULL
  LOOP
    CONTINUE WHEN r.telefone = '';
    INSERT INTO public.atend_conversas (clinica_id, canal, contato_telefone, contato_nome, status, ultima_msg_em, ultima_msg_preview)
    SELECT r.clinica_id, 'whatsapp', r.telefone, r.telefone, 'active',
           MAX(recebida_em),
           (SELECT body FROM public.whatsapp_mensagens WHERE clinica_id = r.clinica_id AND (from_number = r.telefone OR to_number = r.telefone) ORDER BY recebida_em DESC LIMIT 1)
    FROM public.whatsapp_mensagens
    WHERE clinica_id = r.clinica_id AND (from_number = r.telefone OR to_number = r.telefone)
    ON CONFLICT (clinica_id, canal, contato_telefone) DO NOTHING;

    UPDATE public.whatsapp_mensagens m
      SET conversa_id = (SELECT id FROM public.atend_conversas c WHERE c.clinica_id = r.clinica_id AND c.canal='whatsapp' AND c.contato_telefone = r.telefone)
      WHERE m.clinica_id = r.clinica_id AND (m.from_number = r.telefone OR m.to_number = r.telefone) AND m.conversa_id IS NULL;
  END LOOP;
END $$;

-- =====================================================
-- SEED: motivos de pausa padrão (sem clínica específica — feito via app)
-- =====================================================
-- (seed por clínica acontece via UI quando o gestor abre a aba "Pausas")