-- lovable-cron-fallback-reviewed: 144 runs/day; lembrete de consulta precisa sair dentro da janela comercial com atraso máximo de 10 min; cadência definida no arquivo de migração já revisado no repositório
-- Confirmação automática de consultas pelo WhatsApp oficial (Zap OS).
--
-- Uma rotina (pg_cron → rota /api/public/hooks/confirmacao-consultas) envia um
-- template aprovado pela Meta 2 dias e 1 dia antes da consulta, dentro do
-- horário comercial. A resposta do paciente ("1"/"2" ou botão) é tratada no
-- webhook de entrada ANTES da Nina e da fila.
--
-- Travas de negócio (implementadas no servidor, registradas aqui):
--   • só altera agendamento que ainda está "agendado" e no MESMO horário do envio;
--     qualquer mudança manual da recepção prevalece;
--   • cancelamento grava motivo automático; check-in continua manual;
--   • o recurso nasce DESLIGADO (ativo = false).

-- 1) Configuração por clínica ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agendamento_confirmacao_config (
  clinica_id             uuid PRIMARY KEY REFERENCES public.clinicas(id) ON DELETE CASCADE,
  ativo                  boolean NOT NULL DEFAULT false,
  -- Piloto: quando preenchido, só estes médicos recebem lembrete automático.
  medico_ids             uuid[],
  etapas                 text[] NOT NULL DEFAULT ARRAY['48h','24h'],
  hora_inicio            time NOT NULL DEFAULT '08:00',
  hora_fim               time NOT NULL DEFAULT '19:00',
  max_por_rodada         integer NOT NULL DEFAULT 40 CHECK (max_por_rodada BETWEEN 1 AND 200),
  template_nome          text NOT NULL DEFAULT 'confirmacao_consulta_v1',
  template_idioma        text NOT NULL DEFAULT 'pt_BR',
  template_status        text,
  template_verificado_em timestamptz,
  template_erro          text,
  ultima_rodada_em       timestamptz,
  ultima_rodada_resumo   jsonb,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agendamento_confirmacao_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "confirmacao_config: gestores leem" ON public.agendamento_confirmacao_config;
CREATE POLICY "confirmacao_config: gestores leem" ON public.agendamento_confirmacao_config
  FOR SELECT TO authenticated USING (public.can_manage_clinica(auth.uid(), clinica_id));
-- Sem policy de escrita: só o servidor (service_role) altera.

INSERT INTO public.agendamento_confirmacao_config (clinica_id)
SELECT clinica_id FROM public.whatsapp_configs
ON CONFLICT (clinica_id) DO NOTHING;

-- 2) Controle de envios e respostas -----------------------------------------
CREATE TABLE IF NOT EXISTS public.agendamento_confirmacoes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id               uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  agendamento_id           uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  paciente_id              uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  medico_id                uuid,
  etapa                    text NOT NULL CHECK (etapa IN ('48h','24h')),
  -- Foto do horário no envio: se a consulta for reagendada, a resposta não vale.
  agendamento_inicio       timestamptz NOT NULL,
  telefone                 text,          -- 55 + DDD + número, só dígitos
  telefone_chave           text,          -- DDD + últimos 8 dígitos (casa com/sem o 9)
  status                   text NOT NULL DEFAULT 'reservado' CHECK (status IN (
                             'reservado','enviado','sem_telefone','falha',
                             'processando','confirmado','cancelado','sem_efeito','expirado')),
  template_nome            text,
  wa_message_id            text UNIQUE,
  enviado_em               timestamptz,
  entregue_em              timestamptz,
  lido_em                  timestamptz,
  erro                     text,
  resposta_acao            text CHECK (resposta_acao IN ('confirmar','cancelar')),
  resposta_texto           text,
  resposta_wa_message_id   text,
  respondido_em            timestamptz,
  -- Motivo legível quando a resposta não pôde alterar a agenda.
  observacao               text,
  fechamento_wa_message_id text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agendamento_id, etapa)
);
CREATE INDEX IF NOT EXISTS idx_ag_confirmacoes_pendentes_tel
  ON public.agendamento_confirmacoes (clinica_id, telefone_chave)
  WHERE status = 'enviado';
CREATE INDEX IF NOT EXISTS idx_ag_confirmacoes_agendamento
  ON public.agendamento_confirmacoes (agendamento_id);

ALTER TABLE public.agendamento_confirmacoes ENABLE ROW LEVEL SECURITY;
-- Leitura herda a visibilidade do próprio agendamento (inclusive a restrição
-- de médico que só vê a própria agenda). Escrita: só o servidor.
DROP POLICY IF EXISTS "confirmacoes: quem ve o agendamento le" ON public.agendamento_confirmacoes;
CREATE POLICY "confirmacoes: quem ve o agendamento le" ON public.agendamento_confirmacoes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agendamentos a WHERE a.id = agendamento_id));

REVOKE INSERT, UPDATE, DELETE ON public.agendamento_confirmacoes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.agendamento_confirmacao_config FROM anon, authenticated;
REVOKE ALL ON public.agendamento_confirmacoes FROM anon;
REVOKE ALL ON public.agendamento_confirmacao_config FROM anon;

-- 3) Token do job (gerado no banco, nunca versionado) ------------------------
CREATE TABLE IF NOT EXISTS public.sistema_job_tokens (
  nome       text PRIMARY KEY,
  token      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sistema_job_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sistema_job_tokens FROM PUBLIC, anon, authenticated;

INSERT INTO public.sistema_job_tokens (nome, token)
VALUES (
  'confirmacao-consultas',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
ON CONFLICT (nome) DO NOTHING;

-- 4) Agendamento da rotina (a cada 10 min; a rota decide o horário comercial) -
DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'confirmacao-consultas-whatsapp';
    PERFORM cron.schedule(
      'confirmacao-consultas-whatsapp',
      '*/10 * * * *',
      $cmd$
      SELECT net.http_post(
        url := 'https://project--9cab2db5-e9b1-4209-b352-fc7a438da482.lovable.app/api/public/hooks/confirmacao-consultas',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-job-token', (SELECT token FROM public.sistema_job_tokens WHERE nome = 'confirmacao-consultas')
        ),
        body := '{"acao":"rodada"}'::jsonb,
        timeout_milliseconds := 60000
      );
      $cmd$
    );
  END IF;
END $$;