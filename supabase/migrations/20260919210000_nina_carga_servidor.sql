-- Fila durável exclusiva da homologação. Não converte nem retoma cargas antigas.
CREATE TABLE IF NOT EXISTS public.nina_carga_servidor_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  ativo boolean NOT NULL DEFAULT false,
  job_url text CHECK (job_url ~ '^https://[^/?#]+/api/public/nina/carga$')
);
INSERT INTO public.nina_carga_servidor_config(id, ativo, job_url)
SELECT true, false, regexp_replace(job_url, '/api/public/nina/watchdog/?$', '/api/public/nina/carga')
FROM public.nina_watchdog_config WHERE id AND job_url ~ '^https://[^/?#]+/api/public/nina/watchdog/?$'
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nina_carga_servidor_config(id) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE public.nina_carga_servidor_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nina_carga_servidor_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.nina_carga_servidor_config TO service_role;

CREATE TABLE IF NOT EXISTS public.nina_carga_servidor_tarefas (
  carga_id uuid NOT NULL REFERENCES public.nina_teste_carga(id),
  slot integer NOT NULL CHECK (slot BETWEEN 0 AND 9),
  token uuid,
  request_id bigint,
  disponivel_em timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz,
  iniciado_em timestamptz,
  expira_em timestamptz,
  tentativas integer NOT NULL DEFAULT 0,
  falhas integer NOT NULL DEFAULT 0,
  ultimo_erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(carga_id, slot)
);
ALTER TABLE public.nina_carga_servidor_tarefas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nina_carga_servidor_tarefas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.nina_carga_servidor_tarefas TO service_role;
CREATE INDEX IF NOT EXISTS nina_carga_servidor_ativas ON public.nina_teste_carga(updated_at)
  WHERE config->>'executor' = 'carga-v5-servidor' AND status IN ('preparando','executando') AND NOT cancelar;

INSERT INTO public.sistema_job_tokens(nome,token)
VALUES('nina-carga', gen_random_uuid()::text || gen_random_uuid()::text) ON CONFLICT(nome) DO NOTHING;

-- Somente os handlers autenticados do servidor podem criar/alterar uma carga autônoma.
-- As políticas permissivas legadas continuam atendendo os executores anteriores.
DO $$
DECLARE _t text; _op text; _nome text; _regra text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['nina_teste_carga','nina_teste_carga_amostras'] LOOP
    _regra := CASE WHEN _t = 'nina_teste_carga' THEN
      'COALESCE(config->>''executor'','''') <> ''carga-v5-servidor'''
      ELSE 'NOT EXISTS (SELECT 1 FROM public.nina_teste_carga c WHERE c.id=carga_id AND c.config->>''executor''=''carga-v5-servidor'')' END;
    FOREACH _op IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      _nome := _t || '_servidor_' || lower(_op);
      IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=_t AND policyname=_nome) THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s',
          _nome, _t, _op, CASE _op WHEN 'INSERT' THEN 'WITH CHECK ('||_regra||')'
          WHEN 'DELETE' THEN 'USING ('||_regra||')' ELSE 'USING ('||_regra||') WITH CHECK ('||_regra||')' END);
      END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.nina_carga_servidor_disponivel() RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM nina_carga_servidor_config WHERE id AND ativo AND job_url IS NOT NULL)
    AND EXISTS(SELECT 1 FROM sistema_job_tokens WHERE nome='nina-carga' AND length(token)>0)
    AND EXISTS(SELECT 1 FROM cron.job WHERE jobname='nina-carga-servidor' AND active)
$$;

CREATE OR REPLACE FUNCTION public.nina_carga_servidor_despachar(_carga_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _cfg record; _c record; _j record; _limite integer; _n integer := 0;
  _segredo text; _token uuid; _request bigint; _falhas integer; _agora timestamptz;
BEGIN
  SELECT * INTO _cfg FROM nina_carga_servidor_config WHERE id AND ativo AND job_url IS NOT NULL;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT token INTO _segredo FROM sistema_job_tokens WHERE nome='nina-carga';
  IF _segredo IS NULL THEN RETURN 0; END IF;
  -- Todas as operações travam carga antes de tarefa, inclusive início e conclusão.
  FOR _c IN SELECT c.* FROM nina_teste_carga c
    WHERE c.config->>'executor'='carga-v5-servidor' AND c.status IN ('preparando','executando')
      AND NOT c.cancelar AND (_carga_id IS NULL OR c.id=_carga_id)
      AND EXISTS(SELECT 1 FROM clinica_memberships m WHERE m.clinica_id=c.clinica_id AND m.user_id=c.criado_por AND m.ativo)
    ORDER BY c.updated_at LIMIT 50 FOR UPDATE OF c SKIP LOCKED
  LOOP
    _limite := CASE WHEN _c.status='preparando' THEN 1 ELSE
      greatest(1, least(10, COALESCE((_c.config->>'conversasSimultaneas')::integer,1),
        COALESCE((_c.config->>'leadsAtivos')::integer,1))) END;
    INSERT INTO nina_carga_servidor_tarefas(carga_id,slot)
      SELECT _c.id, generate_series(0,_limite-1) ON CONFLICT DO NOTHING;
    FOR _j IN SELECT * FROM nina_carga_servidor_tarefas
      WHERE carga_id=_c.id AND slot < _limite AND disponivel_em <= clock_timestamp()
        AND (token IS NULL OR expira_em <= clock_timestamp()) ORDER BY slot FOR UPDATE
    LOOP
      _agora := clock_timestamp();
      _falhas := _j.falhas + CASE WHEN _j.token IS NOT NULL THEN 1 ELSE 0 END;
      IF _falhas >= 3 THEN
        UPDATE nina_carga_servidor_tarefas SET falhas=_falhas, ultimo_erro='TAREFA_SEM_CONFIRMACAO'
          WHERE carga_id=_c.id AND slot=_j.slot;
        UPDATE nina_teste_carga SET status='erro',cancelar=true,finalizado_em=_agora,
          config=jsonb_set(config,'{_cargaParalela}',COALESCE(config->'_cargaParalela','{}') ||
            jsonb_build_object('erro','O servidor não confirmou a execução após três tentativas. Confira a disponibilidade do serviço.')) WHERE id=_c.id;
        EXIT;
      END IF;
      _token := gen_random_uuid();
      SELECT net.http_post(url:=_cfg.job_url,
        headers:=jsonb_build_object('Content-Type','application/json','x-job-token',_segredo),
        body:=jsonb_build_object('cargaId',_c.id,'slot',_j.slot,'token',_token),
        timeout_milliseconds:=600000) INTO _request;
      UPDATE nina_carga_servidor_tarefas SET token=_token,request_id=_request,
        enviado_em=_agora,iniciado_em=NULL,expira_em=_agora+interval '60 seconds',
        tentativas=tentativas+1,falhas=_falhas WHERE carga_id=_c.id AND slot=_j.slot;
      _n := _n+1;
    END LOOP;
  END LOOP;
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.nina_carga_servidor_assumir(_carga_id uuid,_slot integer,_token uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _c record;
BEGIN
  SELECT c.* INTO _c FROM nina_teste_carga c WHERE c.id=_carga_id FOR UPDATE;
  IF NOT FOUND OR _c.config->>'executor'<>'carga-v5-servidor' OR _c.cancelar
    OR _c.status NOT IN ('preparando','executando') OR (_c.status='preparando' AND _slot<>0)
    OR NOT EXISTS(SELECT 1 FROM nina_carga_servidor_config WHERE id AND ativo)
    OR NOT EXISTS(SELECT 1 FROM clinica_memberships WHERE clinica_id=_c.clinica_id AND user_id=_c.criado_por AND ativo)
  THEN RETURN NULL; END IF;
  UPDATE nina_carga_servidor_tarefas SET iniciado_em=clock_timestamp(),expira_em=clock_timestamp()+interval '420 seconds'
    WHERE carga_id=_carga_id AND slot=_slot AND token=_token AND iniciado_em IS NULL AND expira_em>clock_timestamp();
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN _c.clinica_id;
END $$;

CREATE OR REPLACE FUNCTION public.nina_carga_servidor_renovar(_carga_id uuid,_slot integer,_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _c record;
BEGIN
  SELECT * INTO _c FROM nina_teste_carga WHERE id=_carga_id FOR UPDATE;
  IF NOT FOUND OR _c.cancelar OR _c.status NOT IN ('preparando','executando')
    OR NOT EXISTS(SELECT 1 FROM nina_carga_servidor_config WHERE id AND ativo)
    OR NOT EXISTS(SELECT 1 FROM clinica_memberships WHERE clinica_id=_c.clinica_id AND user_id=_c.criado_por AND ativo)
  THEN RETURN false; END IF;
  UPDATE nina_carga_servidor_tarefas SET expira_em=clock_timestamp()+interval '420 seconds'
    WHERE carga_id=_carga_id AND slot=_slot AND token=_token AND iniciado_em IS NOT NULL AND expira_em>clock_timestamp();
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.nina_carga_servidor_finalizar(
  _carga_id uuid,_slot integer,_token uuid,_aguardar_ms integer DEFAULT 0,_falhou boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _falhas integer;
BEGIN
  PERFORM 1 FROM nina_teste_carga WHERE id=_carga_id FOR UPDATE;
  UPDATE nina_carga_servidor_tarefas SET token=NULL,expira_em=NULL,
    disponivel_em=clock_timestamp()+make_interval(secs=>greatest(0,least(60000,_aguardar_ms))/1000.0),
    falhas=CASE WHEN _falhou THEN falhas+1 ELSE 0 END,
    ultimo_erro=CASE WHEN _falhou THEN 'CARGA_JOB_FALHOU' ELSE NULL END
    WHERE carga_id=_carga_id AND slot=_slot AND token=_token AND iniciado_em IS NOT NULL RETURNING falhas INTO _falhas;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _falhas >= 3 THEN
    UPDATE nina_teste_carga SET status='erro',cancelar=true,finalizado_em=clock_timestamp(),
      config=jsonb_set(config,'{_cargaParalela}',COALESCE(config->'_cargaParalela','{}') ||
        jsonb_build_object('erro','A execução no servidor falhou três vezes. Confira o diagnóstico antes de iniciar outro teste.'))
      WHERE id=_carga_id AND status IN ('preparando','executando') AND NOT cancelar;
  ELSE
    PERFORM nina_carga_servidor_despachar(_carga_id);
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.nina_carga_servidor_inicio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.config->>'executor'='carga-v5-servidor' AND NOT NEW.cancelar AND NEW.status IN ('preparando','executando') THEN
    PERFORM nina_carga_servidor_despachar(NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS nina_carga_servidor_inicio ON public.nina_teste_carga;
CREATE TRIGGER nina_carga_servidor_inicio AFTER INSERT OR UPDATE OF status ON public.nina_teste_carga
  FOR EACH ROW EXECUTE FUNCTION public.nina_carga_servidor_inicio();

REVOKE ALL ON FUNCTION public.nina_carga_servidor_disponivel(), public.nina_carga_servidor_despachar(uuid),
  public.nina_carga_servidor_assumir(uuid,integer,uuid), public.nina_carga_servidor_renovar(uuid,integer,uuid),
  public.nina_carga_servidor_finalizar(uuid,integer,uuid,integer,boolean), public.nina_carga_servidor_inicio()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nina_carga_servidor_disponivel(), public.nina_carga_servidor_despachar(uuid),
  public.nina_carga_servidor_assumir(uuid,integer,uuid), public.nina_carga_servidor_renovar(uuid,integer,uuid),
  public.nina_carga_servidor_finalizar(uuid,integer,uuid,integer,boolean) TO service_role;

-- Só enfileira HTTP. Nenhuma chamada ao modelo ocorre no processo do cron.
SELECT cron.schedule('nina-carga-servidor','1 second','SELECT public.nina_carga_servidor_despachar()');
NOTIFY pgrst, 'reload schema';
