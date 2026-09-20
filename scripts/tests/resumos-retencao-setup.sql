\set ON_ERROR_STOP on
-- Executar exclusivamente em banco PostgreSQL local descartável.
DO $$ BEGIN
  IF current_database() NOT LIKE 'codex_resumos_retencao_test%' THEN
    RAISE EXCEPTION 'Fixture permitida apenas em codex_resumos_retencao_test*';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA cron;
CREATE TABLE cron.job(jobname text PRIMARY KEY, schedule text, command text);
CREATE FUNCTION cron.schedule(text,text,text) RETURNS integer LANGUAGE plpgsql AS $$ BEGIN
  INSERT INTO cron.job VALUES($1,$2,$3) ON CONFLICT(jobname) DO UPDATE SET schedule=$2,command=$3;
  RETURN 1;
END $$;
CREATE TABLE atend_conversas(id uuid PRIMARY KEY,clinica_id uuid NOT NULL,created_at timestamptz DEFAULT now(),
  status text DEFAULT 'waiting',nina_fluxo_estado jsonb, resolved_at timestamptz,closed_at timestamptz,
  resolved_by uuid,handoff_em timestamptz,handoff_resumo jsonb);
CREATE TABLE atend_conversa_eventos(id uuid DEFAULT gen_random_uuid(),clinica_id uuid,conversa_id uuid,
  created_at timestamptz DEFAULT now(),evento text,detalhes jsonb);
CREATE TABLE whatsapp_mensagens(id uuid DEFAULT gen_random_uuid(),body text);
CREATE TABLE agendamentos(id uuid DEFAULT gen_random_uuid(),procedimento text);
CREATE TABLE atend_handoff_resumos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinica_id uuid NOT NULL,
  conversa_id uuid NOT NULL REFERENCES atend_conversas(id),versao integer NOT NULL DEFAULT 1,handoff_em timestamptz NOT NULL,
  motivo text,status text DEFAULT 'gerando',payload jsonb,erro text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),
  situacao text DEFAULT 'active',desfecho text,resolvido_em timestamptz,resolvido_por uuid,UNIQUE(conversa_id,handoff_em));
CREATE UNIQUE INDEX resumo_active ON atend_handoff_resumos(conversa_id) WHERE situacao='active';
INSERT INTO atend_conversas(id,clinica_id,created_at,handoff_em,handoff_resumo) VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010',now()-interval '10 days',now()-interval '8 days','{"resumo":"velho"}'),
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010',now()-interval '3 days',now()-interval '2 days','{"resumo":"recente"}');
INSERT INTO atend_handoff_resumos(clinica_id,conversa_id,handoff_em,payload) VALUES
 ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001',now()-interval '8 days','{"pendencias":["velha"]}'),
 ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000002',now()-interval '2 days','{"pendencias":["Enviar recibo"],"proxima_acao":"Enviar recibo"}');
INSERT INTO whatsapp_mensagens(body) VALUES ('Mensagem original preservada');
INSERT INTO agendamentos(procedimento) VALUES ('Consulta preservada');
INSERT INTO atend_conversa_eventos(clinica_id,conversa_id,evento,detalhes)
 VALUES('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','RESUMO_IA_GERADO','{"versao":12}');
