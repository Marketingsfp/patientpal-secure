-- Resposta da Nina fora da requisição da Meta (17/10/2026).
-- O webhook grava a mensagem, registra uma tarefa aqui e responde "ok" à Meta na
-- hora; o banco (pg_net) aciona /api/public/nina/processar, que gera e envia a
-- resposta. A varredura aciona de novo o que não começou ou parou no meio.
-- Aditiva e reexecutável. Fica DESLIGADA: publicar a rota, ativar a configuração,
-- rodar o diagnóstico e só então ligar a chave `nina_whatsapp_assincrono` da clínica.
-- Plano: docs/nina/plano-webhook-assincrono-2026-10-17.html

CREATE TABLE IF NOT EXISTS public.nina_whatsapp_assincrono_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  ativo boolean NOT NULL DEFAULT false,
  job_url text CHECK (job_url ~ '^https://[^/?#]+/api/public/nina/processar$')
);
INSERT INTO public.nina_whatsapp_assincrono_config(id, ativo, job_url)
SELECT true, false, regexp_replace(job_url, '/api/public/nina/watchdog/?$', '/api/public/nina/processar')
FROM public.nina_watchdog_config WHERE id AND job_url ~ '^https://[^/?#]+/api/public/nina/watchdog/?$'
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nina_whatsapp_assincrono_config(id) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE public.nina_whatsapp_assincrono_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nina_whatsapp_assincrono_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.nina_whatsapp_assincrono_config TO service_role;

-- Uma tarefa por mensagem recebida. Sem texto, telefone ou nome do paciente.
CREATE TABLE IF NOT EXISTS public.nina_whatsapp_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid REFERENCES public.clinicas(id) ON DELETE CASCADE,
  mensagem_id uuid UNIQUE REFERENCES public.whatsapp_mensagens(id) ON DELETE CASCADE,
  phone_number_id text CHECK (phone_number_id IS NULL OR phone_number_id ~ '^[0-9]{1,32}$'),
  audio_falhou boolean NOT NULL DEFAULT false,
  modo text NOT NULL DEFAULT 'responder' CHECK (modo IN ('responder','encaminhar','diagnostico')),
  estado text NOT NULL DEFAULT 'pendente'
    CHECK (estado IN ('pendente','enviada','processando','concluida','falhou')),
  diagnostico_segundos integer CHECK (diagnostico_segundos BETWEEN 1 AND 280),
  token uuid,
  request_id bigint,
  disponivel_em timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz,
  iniciado_em timestamptz,
  expira_em timestamptz,
  concluido_em timestamptz,
  tentativas integer NOT NULL DEFAULT 0,
  falhas integer NOT NULL DEFAULT 0,
  ultimo_erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_whatsapp_tarefas_diagnostico_chk
    CHECK ((modo = 'diagnostico') = (mensagem_id IS NULL)
      AND (modo = 'diagnostico' OR clinica_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS nina_whatsapp_tarefas_abertas ON public.nina_whatsapp_tarefas(disponivel_em)
  WHERE estado IN ('pendente','enviada','processando');
CREATE INDEX IF NOT EXISTS nina_whatsapp_tarefas_fechadas ON public.nina_whatsapp_tarefas(concluido_em)
  WHERE estado IN ('concluida','falhou');
ALTER TABLE public.nina_whatsapp_tarefas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nina_whatsapp_tarefas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.nina_whatsapp_tarefas TO service_role;

INSERT INTO public.sistema_job_tokens(nome, token)
VALUES('nina-processar', gen_random_uuid()::text || gen_random_uuid()::text) ON CONFLICT(nome) DO NOTHING;

CREATE OR REPLACE FUNCTION public.nina_whatsapp_assincrono_disponivel() RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM nina_whatsapp_assincrono_config WHERE id AND ativo AND job_url IS NOT NULL)
    AND EXISTS(SELECT 1 FROM sistema_job_tokens WHERE nome='nina-processar' AND length(token)>0)
    AND EXISTS(SELECT 1 FROM cron.job WHERE jobname='nina-whatsapp-varredura' AND active)
$$;

-- Aciona a rota para uma tarefa já travada por quem chama. Só id e token vão no corpo.
CREATE OR REPLACE FUNCTION public.nina_whatsapp_enviar(_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _url text; _segredo text; _token uuid := gen_random_uuid(); _request bigint;
BEGIN
  SELECT job_url INTO _url FROM nina_whatsapp_assincrono_config WHERE id AND ativo AND job_url IS NOT NULL;
  SELECT token INTO _segredo FROM sistema_job_tokens WHERE nome='nina-processar' AND length(token)>0;
  IF _url IS NULL OR _segredo IS NULL THEN RETURN false; END IF;
  SELECT net.http_post(url:=_url,
    headers:=jsonb_build_object('Content-Type','application/json','x-job-token',_segredo),
    body:=jsonb_build_object('tarefa',_id,'token',_token),
    timeout_milliseconds:=300000) INTO _request;
  UPDATE nina_whatsapp_tarefas SET estado='enviada', token=_token, request_id=_request,
    enviado_em=clock_timestamp(), iniciado_em=NULL, expira_em=clock_timestamp()+interval '60 seconds',
    tentativas=tentativas+1
    WHERE id=_id;
  RETURN true;
END $$;

-- Chamado pelo webhook. NULL = responder na própria requisição (caminho de sempre).
CREATE OR REPLACE FUNCTION public.nina_whatsapp_despachar(
  _clinica_id uuid, _mensagem_id uuid, _audio_falhou boolean DEFAULT false, _phone_number_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT nina_whatsapp_assincrono_disponivel() THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM whatsapp_mensagens
    WHERE id=_mensagem_id AND clinica_id=_clinica_id AND direction='in') THEN RETURN NULL; END IF;
  INSERT INTO nina_whatsapp_tarefas(clinica_id, mensagem_id, audio_falhou, phone_number_id)
    VALUES(_clinica_id, _mensagem_id, COALESCE(_audio_falhou,false),
      CASE WHEN _phone_number_id ~ '^[0-9]{1,32}$' THEN _phone_number_id END)
    ON CONFLICT (mensagem_id) DO NOTHING RETURNING id INTO _id;
  IF _id IS NULL THEN
    -- Reentrega da Meta: a tarefa já existe e segue o próprio curso.
    SELECT id INTO _id FROM nina_whatsapp_tarefas WHERE mensagem_id=_mensagem_id AND clinica_id=_clinica_id;
    RETURN _id;
  END IF;
  IF NOT nina_whatsapp_enviar(_id) THEN RAISE EXCEPTION 'NINA_ASSINCRONO_INDISPONIVEL'; END IF;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.nina_whatsapp_assumir(_tarefa uuid, _token uuid)
RETURNS TABLE(clinica_id uuid, mensagem_id uuid, audio_falhou boolean, phone_number_id text,
  modo text, diagnostico_segundos integer, tentativas integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY UPDATE nina_whatsapp_tarefas t SET estado='processando', iniciado_em=clock_timestamp(),
      expira_em=clock_timestamp()+interval '90 seconds'
    WHERE t.id=_tarefa AND t.token=_token AND t.estado='enviada' AND t.expira_em > clock_timestamp()
    RETURNING t.clinica_id, t.mensagem_id, t.audio_falhou, t.phone_number_id, t.modo,
      t.diagnostico_segundos, t.tentativas;
END $$;

CREATE OR REPLACE FUNCTION public.nina_whatsapp_renovar(_tarefa uuid, _token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE nina_whatsapp_tarefas SET expira_em=clock_timestamp()+interval '90 seconds'
    WHERE id=_tarefa AND token=_token AND estado='processando' AND expira_em > clock_timestamp();
  RETURN FOUND;
END $$;

-- concluida | falhou: encerra. repetir ("conversa ocupada"): volta para a fila com espera;
-- depois de 10 acionamentos, a mensagem vai para a equipe com o aviso padrão.
CREATE OR REPLACE FUNCTION public.nina_whatsapp_finalizar(
  _tarefa uuid, _token uuid, _resultado text, _aguardar_ms integer DEFAULT 0, _erro text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _t record;
BEGIN
  IF _resultado NOT IN ('concluida','repetir','falhou') THEN RAISE EXCEPTION 'NINA_RESULTADO_INVALIDO'; END IF;
  SELECT * INTO _t FROM nina_whatsapp_tarefas WHERE id=_tarefa AND token=_token AND estado='processando' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _resultado = 'repetir' AND _t.modo = 'responder' THEN
    UPDATE nina_whatsapp_tarefas SET estado='pendente', token=NULL, expira_em=NULL,
      modo=CASE WHEN _t.tentativas >= 10 THEN 'encaminhar' ELSE modo END,
      disponivel_em=clock_timestamp()+CASE WHEN _t.tentativas >= 10 THEN interval '0'
        ELSE make_interval(secs=>greatest(0,least(60000,COALESCE(_aguardar_ms,0)))/1000.0) END,
      ultimo_erro=CASE WHEN _t.tentativas >= 10 THEN 'LIMITE_TENTATIVAS' ELSE left(_erro,300) END
      WHERE id=_tarefa;
    IF _t.tentativas >= 10 OR COALESCE(_aguardar_ms,0) <= 0 THEN PERFORM nina_whatsapp_enviar(_tarefa); END IF;
    RETURN true;
  END IF;
  UPDATE nina_whatsapp_tarefas SET
    estado=CASE WHEN _resultado='concluida' THEN 'concluida' ELSE 'falhou' END,
    token=NULL, expira_em=NULL, concluido_em=clock_timestamp(),
    ultimo_erro=CASE WHEN _resultado='concluida' THEN ultimo_erro ELSE left(COALESCE(_erro,'FALHOU'),300) END
    WHERE id=_tarefa;
  RETURN true;
END $$;

-- Cron: aciona o que está disponível ou parou (reserva vencida). Três chamadas
-- perdidas viram encaminhamento para a equipe; cinco encerram a tarefa.
CREATE OR REPLACE FUNCTION public.nina_whatsapp_varrer() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _t record; _n integer := 0; _falhas integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM nina_whatsapp_assincrono_config WHERE id AND ativo AND job_url IS NOT NULL) THEN
    RETURN 0;
  END IF;
  FOR _t IN SELECT * FROM nina_whatsapp_tarefas
    WHERE (estado='pendente' AND disponivel_em <= clock_timestamp())
       OR (estado IN ('enviada','processando') AND expira_em <= clock_timestamp())
    ORDER BY disponivel_em LIMIT 50 FOR UPDATE SKIP LOCKED
  LOOP
    IF _t.estado IN ('enviada','processando') THEN
      _falhas := _t.falhas + 1;
      IF _t.modo = 'diagnostico' OR _falhas >= 5 THEN
        UPDATE nina_whatsapp_tarefas SET estado='falhou', falhas=_falhas, token=NULL, expira_em=NULL,
          concluido_em=clock_timestamp(), ultimo_erro='SEM_CONFIRMACAO' WHERE id=_t.id;
        CONTINUE;
      END IF;
      UPDATE nina_whatsapp_tarefas SET falhas=_falhas, ultimo_erro='SEM_CONFIRMACAO',
        modo=CASE WHEN modo='responder' AND _falhas >= 3 THEN 'encaminhar' ELSE modo END
        WHERE id=_t.id;
    END IF;
    IF nina_whatsapp_enviar(_t.id) THEN _n := _n + 1; END IF;
  END LOOP;
  -- Guarda curta: o histórico das tarefas fica 7 dias.
  DELETE FROM nina_whatsapp_tarefas WHERE id IN (
    SELECT id FROM nina_whatsapp_tarefas
    WHERE estado IN ('concluida','falhou') AND concluido_em < now() - interval '7 days' LIMIT 500);
  RETURN _n;
END $$;

-- Prova de que uma chamada aberta pelo banco passa dos 30 s do Cloudflare:
-- SELECT public.nina_whatsapp_diagnostico(90); e conferir a tarefa depois de ~2 min.
CREATE OR REPLACE FUNCTION public.nina_whatsapp_diagnostico(_segundos integer DEFAULT 90) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO nina_whatsapp_tarefas(modo, diagnostico_segundos)
    VALUES('diagnostico', greatest(1, least(280, COALESCE(_segundos,90)))) RETURNING id INTO _id;
  IF NOT nina_whatsapp_enviar(_id) THEN RAISE EXCEPTION 'NINA_ASSINCRONO_INATIVO: ative a configuração antes'; END IF;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.nina_whatsapp_assincrono_disponivel(), public.nina_whatsapp_enviar(uuid),
  public.nina_whatsapp_despachar(uuid,uuid,boolean,text), public.nina_whatsapp_assumir(uuid,uuid),
  public.nina_whatsapp_renovar(uuid,uuid), public.nina_whatsapp_finalizar(uuid,uuid,text,integer,text),
  public.nina_whatsapp_varrer(), public.nina_whatsapp_diagnostico(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nina_whatsapp_assincrono_disponivel(),
  public.nina_whatsapp_despachar(uuid,uuid,boolean,text), public.nina_whatsapp_assumir(uuid,uuid),
  public.nina_whatsapp_renovar(uuid,uuid), public.nina_whatsapp_finalizar(uuid,uuid,text,integer,text)
  TO service_role;

-- Só consulta SQL; sem tarefa disponível, não faz chamada nenhuma.
SELECT cron.schedule('nina-whatsapp-varredura', '5 seconds', 'SELECT public.nina_whatsapp_varrer()');
NOTIFY pgrst, 'reload schema';
