CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_clinica uuid;
  v_record_id text;
  v_before jsonb;
  v_after jsonb;
  v_headers jsonb;
  v_ip inet;
  v_ua text;
  v_role text;
  v_actor_source text;
BEGIN
  -- Importação do sistema antigo (Clínica Total): a função de lote grava 1 linha de auditoria por lote.
  IF current_setting('app.skip_audit_importacao', true) = '1'
 AND TG_TABLE_NAME IN ('pacientes','prontuarios') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  EXCEPTION WHEN OTHERS THEN v_email := NULL; END;

  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_ua := v_headers->>'user-agent';
    BEGIN
      v_ip := NULLIF(
        split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1),
        ''
      )::inet;
    EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL; v_ua := NULL; v_ip := NULL;
  END;

  -- Preencher autor "Sistema" quando não houver usuário autenticado
  IF v_user_id IS NULL THEN
    BEGIN
      v_role := current_setting('request.jwt.claim.role', true);
    EXCEPTION WHEN OTHERS THEN v_role := NULL; END;

    BEGIN
      v_actor_source := current_setting('app.actor_source', true);
    EXCEPTION WHEN OTHERS THEN v_actor_source := NULL; END;

    IF v_actor_source IS NOT NULL AND v_actor_source <> '' THEN
      v_email := 'sistema (' || v_actor_source || ')';
    ELSIF v_role = 'service_role' THEN
      v_email := 'sistema (service_role)';
    ELSIF v_headers IS NULL THEN
      v_email := 'sistema (manutenção)';
    ELSE
      v_email := 'sistema';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_before := to_jsonb(OLD);
    v_after := NULL;
    v_record_id := (to_jsonb(OLD)->>'id');
    v_clinica := NULLIF(to_jsonb(OLD)->>'clinica_id','')::uuid;
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_record_id := (to_jsonb(NEW)->>'id');
    v_clinica := NULLIF(to_jsonb(NEW)->>'clinica_id','')::uuid;
  ELSE
    v_before := NULL;
    v_after := to_jsonb(NEW);
    v_record_id := (to_jsonb(NEW)->>'id');
    v_clinica := NULLIF(to_jsonb(NEW)->>'clinica_id','')::uuid;
  END IF;

  INSERT INTO public.audit_log (
    user_id, user_email, clinica_id, table_name, record_id, action,
    dados_antes, dados_depois, ip_address, user_agent
  ) VALUES (
    v_user_id, v_email, v_clinica, TG_TABLE_NAME, v_record_id, TG_OP,
    v_before, v_after, v_ip, v_ua
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Importação do sistema antigo "Clínica Total" (aditiva). Nenhum dado é importado por esta migração.

ALTER TABLE public.prontuarios ADD COLUMN IF NOT EXISTS legado_origem text;
ALTER TABLE public.prontuarios ADD COLUMN IF NOT EXISTS legado_id text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_prontuarios_legado
  ON public.prontuarios (clinica_id, legado_origem, legado_id) WHERE legado_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pacientes_clinica_cod_anterior
  ON public.pacientes (clinica_id, codigo_prontuario_anterior) WHERE codigo_prontuario_anterior IS NOT NULL;

CREATE TABLE public.paciente_observacoes_legado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id),
  origem text NOT NULL DEFAULT 'clinica_total',
  legado_id text NOT NULL,
  tipo text,
  texto text,
  situacao text,
  usuario_legado text,
  data timestamptz,
  data_observacao timestamptz,
  data_ate timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, origem, legado_id)
);
CREATE INDEX ix_pac_obs_legado_paciente ON public.paciente_observacoes_legado (paciente_id);

CREATE TABLE public.importacao_legado_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id),
  tipo text NOT NULL CHECK (tipo IN ('profissionais','pessoas','prontuarios','observacoes')),
  arquivo_nome text NOT NULL,
  arquivo_tamanho bigint NOT NULL,
  ultima_linha integer NOT NULL DEFAULT 0,
  lidas integer NOT NULL DEFAULT 0,
  inseridas integer NOT NULL DEFAULT 0,
  atualizadas integer NOT NULL DEFAULT 0,
  ignoradas integer NOT NULL DEFAULT 0,
  orfaos integer NOT NULL DEFAULT 0,
  erros integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','concluido')),
  iniciado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  UNIQUE (clinica_id, tipo, arquivo_nome, arquivo_tamanho)
);

CREATE TABLE public.importacao_legado_erros (
  id bigserial PRIMARY KEY,
  execucao_id uuid NOT NULL REFERENCES public.importacao_legado_execucoes(id),
  clinica_id uuid NOT NULL,
  linha integer,
  chave text,
  tipo text NOT NULL DEFAULT 'erro' CHECK (tipo IN ('erro','orfao','aviso')),
  motivo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_imp_legado_erros_exec ON public.importacao_legado_erros (execucao_id, id);

CREATE TABLE public.importacao_legado_profissionais (
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id),
  codigo_pessoa text NOT NULL,
  nome text,
  cpf_digits text,
  medico_id uuid REFERENCES public.medicos(id),
  casado_por text CHECK (casado_por IN ('cpf','nome','manual')),
  sem_medico boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinica_id, codigo_pessoa)
);

CREATE TABLE public.importacao_legado_responsaveis (
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id),
  codigo_pessoa text NOT NULL,
  codigo_responsavel text NOT NULL,
  resultado text,
  PRIMARY KEY (clinica_id, codigo_pessoa)
);
CREATE INDEX ix_imp_legado_resp_pend ON public.importacao_legado_responsaveis (clinica_id) WHERE resultado IS NULL;

GRANT SELECT ON public.paciente_observacoes_legado TO authenticated;
GRANT SELECT ON public.importacao_legado_execucoes TO authenticated;
GRANT SELECT ON public.importacao_legado_erros TO authenticated;
GRANT SELECT ON public.importacao_legado_profissionais TO authenticated;
GRANT SELECT ON public.importacao_legado_responsaveis TO authenticated;
GRANT ALL ON public.paciente_observacoes_legado, public.importacao_legado_execucoes, public.importacao_legado_erros,
  public.importacao_legado_profissionais, public.importacao_legado_responsaveis TO service_role;
GRANT USAGE ON SEQUENCE public.importacao_legado_erros_id_seq TO service_role;

ALTER TABLE public.paciente_observacoes_legado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.importacao_legado_execucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.importacao_legado_erros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.importacao_legado_profissionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.importacao_legado_responsaveis ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._imp_legado_eh_admin(_clinica uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), _clinica, 'admin'::app_role) OR public.is_platform_admin(auth.uid()));
$$;
REVOKE ALL ON FUNCTION public._imp_legado_eh_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._imp_legado_eh_admin(uuid) TO authenticated, service_role;

CREATE POLICY "Membros leem observacoes legadas" ON public.paciente_observacoes_legado
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY "Admin le execucoes" ON public.importacao_legado_execucoes
  FOR SELECT TO authenticated USING (public._imp_legado_eh_admin(clinica_id));
CREATE POLICY "Admin le erros" ON public.importacao_legado_erros
  FOR SELECT TO authenticated USING (public._imp_legado_eh_admin(clinica_id));
CREATE POLICY "Admin le profissionais legados" ON public.importacao_legado_profissionais
  FOR SELECT TO authenticated USING (public._imp_legado_eh_admin(clinica_id));
CREATE POLICY "Admin le responsaveis legados" ON public.importacao_legado_responsaveis
  FOR SELECT TO authenticated USING (public._imp_legado_eh_admin(clinica_id));

CREATE OR REPLACE FUNCTION public._imp_txt(_j jsonb, _k text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(btrim(_j->>_k), '');
$$;

CREATE OR REPLACE FUNCTION public._imp_ts(_t text)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF _t IS NULL OR btrim(_t) = '' THEN RETURN NULL; END IF;
  -- Datas do sistema antigo vêm sem fuso = horário de Brasília.
  RETURN (btrim(_t)::timestamp) AT TIME ZONE 'America/Sao_Paulo';
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._imp_date(_t text)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d date;
BEGIN
  IF _t IS NULL OR btrim(_t) = '' THEN RETURN NULL; END IF;
  d := left(btrim(_t), 10)::date;
  IF d < date '1890-01-01' OR d > date '2100-01-01' THEN RETURN NULL; END IF;
  RETURN d;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._imp_norm_nome(_t text)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT nullif(upper(public.strip_accents(btrim(regexp_replace(coalesce(_t,''), '\s+', ' ', 'g')))), '');
$$;

CREATE OR REPLACE FUNCTION public.importacao_legado_iniciar(
  _clinica uuid, _tipo text, _arquivo_nome text, _arquivo_tamanho bigint)
RETURNS public.importacao_legado_execucoes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.importacao_legado_execucoes;
  v_anterior text;
BEGIN
  IF NOT public._imp_legado_eh_admin(_clinica) THEN
    RAISE EXCEPTION 'Somente administrador da unidade pode importar.' USING ERRCODE = '42501';
  END IF;
  IF _tipo NOT IN ('profissionais','pessoas','prontuarios','observacoes') THEN
    RAISE EXCEPTION 'Tipo de arquivo inválido.';
  END IF;
  v_anterior := CASE _tipo WHEN 'pessoas' THEN 'profissionais' WHEN 'prontuarios' THEN 'pessoas'
                           WHEN 'observacoes' THEN 'prontuarios' ELSE NULL END;
  IF v_anterior IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.importacao_legado_execucoes
     WHERE clinica_id = _clinica AND tipo = v_anterior AND status = 'concluido') THEN
    RAISE EXCEPTION 'Conclua antes a etapa "%".', v_anterior;
  END IF;
  INSERT INTO public.importacao_legado_execucoes (clinica_id, tipo, arquivo_nome, arquivo_tamanho, iniciado_por)
  VALUES (_clinica, _tipo, _arquivo_nome, _arquivo_tamanho, auth.uid())
  ON CONFLICT (clinica_id, tipo, arquivo_nome, arquivo_tamanho) DO UPDATE SET updated_at = now()
  RETURNING * INTO r;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.importacao_legado_concluir(_execucao uuid)
RETURNS public.importacao_legado_execucoes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.importacao_legado_execucoes;
BEGIN
  SELECT * INTO r FROM public.importacao_legado_execucoes WHERE id = _execucao;
  IF r.id IS NULL OR NOT public._imp_legado_eh_admin(r.clinica_id) THEN
    RAISE EXCEPTION 'Somente administrador da unidade pode importar.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.importacao_legado_execucoes
     SET status = 'concluido', concluido_em = now(), updated_at = now()
   WHERE id = _execucao RETURNING * INTO r;
  RETURN r;
END;
$$;

-- Processa um lote de linhas. _linhas = [{"n": <nº da linha>, "d": {...}} | {"n":..., "e": "motivo"}]
CREATE OR REPLACE FUNCTION public.importacao_legado_lote(
  _execucao uuid, _linha_final integer, _linhas jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ex public.importacao_legado_execucoes;
  c uuid;
  it jsonb; d jsonb; n int;
  ins int := 0; upd int := 0; ign int := 0; orf int := 0; err int := 0; v_lidas int := 0;
  v_cod text; v_nome text; v_cpf text; v_cpf_bruto text; v_nasc date; v_sexo text; v_pasta text;
  v_ativo boolean; v_created timestamptz; v_id uuid; v_qtd int; v_codpr text; v_max bigint := 0;
  v_antes jsonb; v_depois jsonb; v_campo text; v_val text;
  v_med uuid; v_prof_nome text; v_obs text; v_data timestamptz; v_pron uuid;
  v_avisos jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO ex FROM public.importacao_legado_execucoes WHERE id = _execucao FOR UPDATE;
  IF ex.id IS NULL OR NOT public._imp_legado_eh_admin(ex.clinica_id) THEN
    RAISE EXCEPTION 'Somente administrador da unidade pode importar.' USING ERRCODE = '42501';
  END IF;
  IF ex.status = 'concluido' THEN RAISE EXCEPTION 'Esta etapa já foi concluída.'; END IF;
  c := ex.clinica_id;
  -- Lote reenviado (ex.: aba fechada antes da resposta): já confirmado, não processa de novo.
  IF _linha_final <= ex.ultima_linha THEN
    RETURN jsonb_build_object('ja_processado', true, 'ultima_linha', ex.ultima_linha, 'total', to_jsonb(ex));
  END IF;

  -- Só dentro desta transação: sem telefone obrigatório e sem auditoria por linha.
  PERFORM set_config('app.skip_telefone_check', '1', true);
  PERFORM set_config('app.skip_audit_importacao', '1', true);
  PERFORM set_config('app.actor_source', 'importacao_clinica_total', true);

  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_linhas, '[]'::jsonb)) LOOP
    n := (it->>'n')::int;
    IF n <= ex.ultima_linha THEN CONTINUE; END IF;
    v_lidas := v_lidas + 1;
    v_cod := NULL;
    IF it ? 'e' THEN
      err := err + 1;
      INSERT INTO public.importacao_legado_erros (execucao_id, clinica_id, linha, tipo, motivo)
      VALUES (_execucao, c, n, 'erro', left(it->>'e', 300));
      CONTINUE;
    END IF;
    d := it->'d';
    BEGIN
      IF ex.tipo = 'profissionais' THEN
        v_cod := public._imp_txt(d, 'codigo_pessoa');
        IF v_cod IS NULL THEN RAISE EXCEPTION 'sem codigo_pessoa'; END IF;
        v_nome := public._imp_txt(d, 'nome');
        v_cpf := nullif(regexp_replace(coalesce(d->>'cpf_cnpj',''), '\D', '', 'g'), '');
        INSERT INTO public.importacao_legado_profissionais (clinica_id, codigo_pessoa, nome, cpf_digits)
        VALUES (c, v_cod, v_nome, v_cpf)
        ON CONFLICT (clinica_id, codigo_pessoa) DO UPDATE
          SET nome = excluded.nome, cpf_digits = excluded.cpf_digits, updated_at = now()
        RETURNING medico_id INTO v_med;
        IF v_med IS NULL THEN
          IF v_cpf IS NOT NULL THEN
            SELECT min(m.id::text)::uuid, count(*) INTO v_med, v_qtd FROM public.medicos m
             WHERE m.clinica_id = c AND regexp_replace(coalesce(m.cpf,''), '\D', '', 'g') = v_cpf;
            IF v_qtd = 1 THEN
              UPDATE public.importacao_legado_profissionais SET medico_id = v_med, casado_por = 'cpf'
               WHERE clinica_id = c AND codigo_pessoa = v_cod AND NOT sem_medico;
            ELSE v_med := NULL; END IF;
          END IF;
          IF v_med IS NULL AND v_nome IS NOT NULL THEN
            SELECT min(m.id::text)::uuid, count(*) INTO v_med, v_qtd FROM public.medicos m
             WHERE m.clinica_id = c AND public._imp_norm_nome(m.nome) = public._imp_norm_nome(v_nome);
            IF v_qtd = 1 THEN
              UPDATE public.importacao_legado_profissionais SET medico_id = v_med, casado_por = 'nome'
               WHERE clinica_id = c AND codigo_pessoa = v_cod AND NOT sem_medico;
            END IF;
          END IF;
        END IF;
        ins := ins + 1;

      ELSIF ex.tipo = 'pessoas' THEN
        v_cod := public._imp_txt(d, 'codigo_pessoa');
        IF v_cod IS NULL THEN RAISE EXCEPTION 'sem codigo_pessoa'; END IF;
        v_nome := public._imp_txt(d, 'nome');
        IF v_nome IS NULL THEN RAISE EXCEPTION 'sem nome'; END IF;
        v_cpf_bruto := public._imp_txt(d, 'cpf_cnpj');
        v_cpf := regexp_replace(coalesce(v_cpf_bruto,''), '\D', '', 'g');
        IF length(v_cpf) NOT IN (11, 14) OR v_cpf ~ '^(\d)\1+$' THEN v_cpf := NULL; END IF;
        v_nasc := public._imp_date(d->>'nascimento_abertura');
        v_sexo := CASE upper(left(btrim(coalesce(d->>'sexo','')), 1))
                    WHEN 'M' THEN 'masculino' WHEN 'F' THEN 'feminino' ELSE 'nao_informar' END;
        v_pasta := coalesce(public._imp_txt(d, 'pasta_ortodontica'), public._imp_txt(d, 'pasta_financeira'));
        v_ativo := upper(coalesce(public._imp_txt(d, 'ativo'), 'S')) <> 'N';
        v_created := public._imp_ts(d->>'data_cadastro');

        v_id := NULL;
        SELECT p.id INTO v_id FROM public.pacientes p
         WHERE p.clinica_id = c AND p.codigo_prontuario_anterior = v_cod ORDER BY p.created_at LIMIT 1;
        IF v_id IS NULL AND v_cpf IS NOT NULL THEN
          SELECT min(p.id::text)::uuid, count(*) INTO v_id, v_qtd FROM public.pacientes p
           WHERE p.clinica_id = c AND p.cpf_digits = v_cpf AND p.codigo_prontuario_anterior IS NULL;
          IF v_qtd <> 1 THEN v_id := NULL; END IF;
        END IF;
        IF v_id IS NULL AND v_nasc IS NOT NULL THEN
          SELECT min(p.id::text)::uuid, count(*) INTO v_id, v_qtd FROM public.pacientes p
           WHERE p.clinica_id = c AND p.codigo_prontuario_anterior IS NULL AND p.data_nascimento = v_nasc
             AND upper(public.strip_accents(btrim(p.nome))) = public._imp_norm_nome(v_nome);
          IF v_qtd <> 1 THEN v_id := NULL; END IF;
        END IF;

        -- CPF já em outro cadastro da unidade: não grava (regra de CPF único), guarda o original.
        IF v_cpf IS NOT NULL AND EXISTS (SELECT 1 FROM public.pacientes p
            WHERE p.clinica_id = c AND p.cpf = v_cpf AND p.id IS DISTINCT FROM v_id) THEN
          v_avisos := v_avisos || jsonb_build_object('n', n, 'k', v_cod, 'm', 'CPF já usado por outro cadastro; guardado nas observações legadas');
          v_cpf := NULL;
        END IF;

        IF v_id IS NOT NULL THEN
          SELECT to_jsonb(p) - 'updated_at' INTO v_antes FROM public.pacientes p WHERE p.id = v_id;
          UPDATE public.pacientes p SET
            codigo_prontuario_anterior = coalesce(p.codigo_prontuario_anterior, v_cod),
            cpf = coalesce(nullif(p.cpf,''), v_cpf),
            data_nascimento = coalesce(p.data_nascimento, v_nasc),
            sexo = CASE WHEN p.sexo = 'nao_informar' THEN v_sexo ELSE p.sexo END,
            email = coalesce(nullif(p.email,''), public._imp_txt(d,'email')),
            telefone = coalesce(nullif(p.telefone,''), public._imp_txt(d,'fone_1')),
            telefone2 = coalesce(nullif(p.telefone2,''), public._imp_txt(d,'fone_2')),
            logradouro = coalesce(nullif(p.logradouro,''), public._imp_txt(d,'endereco')),
            numero = coalesce(nullif(p.numero,''), public._imp_txt(d,'numero')),
            complemento = coalesce(nullif(p.complemento,''), public._imp_txt(d,'complemento')),
            bairro = coalesce(nullif(p.bairro,''), public._imp_txt(d,'bairro')),
            cidade = coalesce(nullif(p.cidade,''), public._imp_txt(d,'cidade')),
            estado = coalesce(nullif(p.estado,''), public._imp_txt(d,'uf')),
            cep = coalesce(nullif(p.cep,''), nullif(regexp_replace(coalesce(d->>'cep',''), '\D','','g'),'')),
            numero_pasta = coalesce(nullif(p.numero_pasta,''), v_pasta),
            pasta_ortodontica = coalesce(nullif(p.pasta_ortodontica,''), public._imp_txt(d,'pasta_ortodontica'))
          WHERE p.id = v_id;
          SELECT to_jsonb(p) - 'updated_at' INTO v_depois FROM public.pacientes p WHERE p.id = v_id;
          IF v_antes IS DISTINCT FROM v_depois THEN upd := upd + 1; ELSE ign := ign + 1; END IF;
        ELSE
          v_codpr := NULL;
          IF v_cod ~ '^\d{1,7}$' THEN
            IF EXISTS (SELECT 1 FROM public.pacientes p WHERE p.clinica_id = c
                         AND p.codigo_prontuario ~ '^\d{1,7}$' AND p.codigo_prontuario::bigint = v_cod::bigint) THEN
              v_avisos := v_avisos || jsonb_build_object('n', n, 'k', v_cod, 'm', 'Número de prontuário já usado; o sistema gerou outro');
            ELSE
              v_codpr := v_cod;
              v_max := greatest(v_max, v_cod::bigint);
            END IF;
          END IF;
          INSERT INTO public.pacientes (
            clinica_id, nome, cpf, data_nascimento, sexo, email, telefone, telefone2,
            logradouro, numero, complemento, bairro, cidade, estado, cep,
            numero_pasta, pasta_ortodontica, ativo, created_at, codigo_prontuario,
            codigo_prontuario_anterior, origem)
          VALUES (
            c, v_nome, v_cpf, v_nasc, v_sexo, public._imp_txt(d,'email'),
            public._imp_txt(d,'fone_1'), public._imp_txt(d,'fone_2'),
            public._imp_txt(d,'endereco'), public._imp_txt(d,'numero'), public._imp_txt(d,'complemento'),
            public._imp_txt(d,'bairro'), public._imp_txt(d,'cidade'), public._imp_txt(d,'uf'),
            nullif(regexp_replace(coalesce(d->>'cep',''), '\D','','g'),''),
            v_pasta, public._imp_txt(d,'pasta_ortodontica'), v_ativo, coalesce(v_created, now()), v_codpr,
            v_cod, 'importacao_clinica_total')
          RETURNING id INTO v_id;
          ins := ins + 1;
        END IF;

        -- Campos sem coluna própria: guardados sem perda, vinculados ao paciente.
        FOREACH v_campo IN ARRAY ARRAY['nome_mae','nome_pai','observacao','observacao_clinica',
                                       'cartao_numero','rg_ie','pasta_financeira'] LOOP
          v_val := public._imp_txt(d, v_campo);
          IF v_val IS NOT NULL THEN
            INSERT INTO public.paciente_observacoes_legado (clinica_id, paciente_id, legado_id, tipo, texto)
            VALUES (c, v_id, 'pessoa:' || v_cod || ':' || v_campo, v_campo, v_val)
            ON CONFLICT (clinica_id, origem, legado_id) DO UPDATE SET texto = excluded.texto, paciente_id = excluded.paciente_id;
          END IF;
        END LOOP;
        IF v_cpf_bruto IS NOT NULL AND v_cpf IS NULL THEN
          INSERT INTO public.paciente_observacoes_legado (clinica_id, paciente_id, legado_id, tipo, texto)
          VALUES (c, v_id, 'pessoa:' || v_cod || ':cpf_original', 'cpf_original', v_cpf_bruto)
          ON CONFLICT (clinica_id, origem, legado_id) DO UPDATE SET texto = excluded.texto, paciente_id = excluded.paciente_id;
        END IF;
        v_val := public._imp_txt(d, 'codigo_responsavel');
        IF v_val IS NOT NULL AND v_val <> v_cod THEN
          INSERT INTO public.importacao_legado_responsaveis (clinica_id, codigo_pessoa, codigo_responsavel)
          VALUES (c, v_cod, v_val)
          ON CONFLICT (clinica_id, codigo_pessoa) DO UPDATE
            SET codigo_responsavel = excluded.codigo_responsavel,
                resultado = CASE WHEN public.importacao_legado_responsaveis.codigo_responsavel = excluded.codigo_responsavel
                                 THEN public.importacao_legado_responsaveis.resultado ELSE NULL END;
        END IF;

      ELSIF ex.tipo = 'prontuarios' THEN
        v_cod := public._imp_txt(d, 'codigo_prontuario');
        IF v_cod IS NULL THEN RAISE EXCEPTION 'sem codigo_prontuario'; END IF;
        v_val := public._imp_txt(d, 'codigo_cliente');
        v_id := NULL;
        SELECT p.id, p.created_at INTO v_id, v_created FROM public.pacientes p
         WHERE p.clinica_id = c AND p.codigo_prontuario_anterior = v_val ORDER BY p.created_at LIMIT 1;
        IF v_id IS NULL THEN
          orf := orf + 1;
          INSERT INTO public.importacao_legado_erros (execucao_id, clinica_id, linha, chave, tipo, motivo)
          VALUES (_execucao, c, n, v_cod, 'orfao', 'Paciente ' || coalesce(v_val, '(vazio)') || ' não encontrado');
          CONTINUE;
        END IF;
        v_med := NULL; v_prof_nome := NULL;
        SELECT lp.medico_id, lp.nome INTO v_med, v_prof_nome FROM public.importacao_legado_profissionais lp
         WHERE lp.clinica_id = c AND lp.codigo_pessoa = public._imp_txt(d, 'codigo_profissional');
        v_data := public._imp_ts(d->>'data');
        IF v_data IS NULL THEN
          v_avisos := v_avisos || jsonb_build_object('n', n, 'k', v_cod, 'm', 'Prontuário sem data; usada a data de cadastro do paciente');
          v_data := v_created;
        END IF;
        v_obs := '[Importado do sistema antigo SFP - prontuario #' || v_cod || ']';
        IF public._imp_txt(d, 'procedimento_realizado') IS NOT NULL THEN
          v_obs := v_obs || E'\n' || 'Procedimento: ' || public._imp_txt(d, 'procedimento_realizado');
        END IF;
        IF v_med IS NULL AND v_prof_nome IS NOT NULL THEN
          v_obs := v_obs || E'\n' || 'Profissional: ' || v_prof_nome;
        ELSIF v_med IS NULL AND public._imp_txt(d, 'codigo_profissional') IS NOT NULL THEN
          v_obs := v_obs || E'\n' || 'Profissional (código antigo): ' || public._imp_txt(d, 'codigo_profissional');
        END IF;
        IF public._imp_txt(d, 'codigo_agenda') IS NOT NULL THEN
          v_obs := v_obs || E'\n' || 'Agenda antiga #' || public._imp_txt(d, 'codigo_agenda');
        END IF;
        v_pron := NULL;
        SELECT id INTO v_pron FROM public.prontuarios
         WHERE clinica_id = c AND legado_origem = 'clinica_total' AND legado_id = v_cod;
        IF v_pron IS NULL THEN
          INSERT INTO public.prontuarios (clinica_id, paciente_id, medico_id, data, queixa_principal, observacoes,
                                          legado_origem, legado_id)
          VALUES (c, v_id, v_med, v_data, d->>'descricao', v_obs, 'clinica_total', v_cod);
          ins := ins + 1;
        ELSE
          -- Reimportação: só completa o médico quando ele foi associado depois.
          UPDATE public.prontuarios SET medico_id = v_med
           WHERE id = v_pron AND medico_id IS NULL AND v_med IS NOT NULL;
          IF FOUND THEN upd := upd + 1; ELSE ign := ign + 1; END IF;
        END IF;

      ELSIF ex.tipo = 'observacoes' THEN
        v_cod := public._imp_txt(d, 'codigo_observacao');
        IF v_cod IS NULL THEN RAISE EXCEPTION 'sem codigo_observacao'; END IF;
        v_val := public._imp_txt(d, 'codigo_pessoa');
        v_id := NULL;
        SELECT p.id INTO v_id FROM public.pacientes p
         WHERE p.clinica_id = c AND p.codigo_prontuario_anterior = v_val ORDER BY p.created_at LIMIT 1;
        IF v_id IS NULL THEN
          orf := orf + 1;
          INSERT INTO public.importacao_legado_erros (execucao_id, clinica_id, linha, chave, tipo, motivo)
          VALUES (_execucao, c, n, v_cod, 'orfao', 'Paciente ' || coalesce(v_val, '(vazio)') || ' não encontrado');
          CONTINUE;
        END IF;
        INSERT INTO public.paciente_observacoes_legado (clinica_id, paciente_id, legado_id, tipo, texto, situacao,
          usuario_legado, data, data_observacao, data_ate)
        VALUES (c, v_id, 'obs:' || v_cod, coalesce(public._imp_txt(d,'tipo'), 'observacao'), d->>'observacao',
          public._imp_txt(d,'situacao'), public._imp_txt(d,'codigo_usuario'), public._imp_ts(d->>'data'),
          public._imp_ts(d->>'data_observacao'), public._imp_ts(d->>'data_ate'))
        ON CONFLICT (clinica_id, origem, legado_id) DO NOTHING;
        IF FOUND THEN ins := ins + 1; ELSE ign := ign + 1; END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      err := err + 1;
      INSERT INTO public.importacao_legado_erros (execucao_id, clinica_id, linha, chave, tipo, motivo)
      VALUES (_execucao, c, n, v_cod, 'erro', left(SQLERRM, 300));
    END;
  END LOOP;

  INSERT INTO public.importacao_legado_erros (execucao_id, clinica_id, linha, chave, tipo, motivo)
  SELECT _execucao, c, (a->>'n')::int, a->>'k', 'aviso', a->>'m' FROM jsonb_array_elements(v_avisos) a;

  -- Números antigos usados como prontuário: a sequência fica sempre acima do maior.
  IF v_max > 0 THEN
    INSERT INTO public.prontuario_sequencia (clinica_id, proximo) VALUES (c, v_max + 1)
    ON CONFLICT (clinica_id) DO UPDATE
      SET proximo = greatest(public.prontuario_sequencia.proximo, v_max + 1), atualizado_em = now();
  END IF;

  UPDATE public.importacao_legado_execucoes SET
    ultima_linha = _linha_final, lidas = lidas + v_lidas,
    inseridas = inseridas + ins, atualizadas = atualizadas + upd, ignoradas = ignoradas + ign,
    orfaos = orfaos + orf, erros = erros + err, updated_at = now()
  WHERE id = _execucao RETURNING * INTO ex;

  -- Uma linha de auditoria por lote (a auditoria por linha fica desligada só aqui).
  INSERT INTO public.audit_log (clinica_id, user_id, user_email, table_name, record_id, action, dados_depois)
  VALUES (c, auth.uid(), 'importacao_clinica_total', 'importacao_legado_' || ex.tipo, _execucao::text, 'INSERT',
    jsonb_build_object('linha_final', _linha_final, 'lidas', v_lidas, 'inseridas', ins, 'atualizadas', upd,
                       'ignoradas', ign, 'orfaos', orf, 'erros', err));

  RETURN jsonb_build_object('ja_processado', false, 'ultima_linha', ex.ultima_linha,
    'lote', jsonb_build_object('lidas', v_lidas, 'inseridas', ins, 'atualizadas', upd, 'ignoradas', ign,
                               'orfaos', orf, 'erros', err),
    'total', to_jsonb(ex));
END;
$$;

-- Preenche responsável (nome/CPF/telefone) a partir do código antigo, em partes.
CREATE OR REPLACE FUNCTION public.importacao_legado_aplicar_responsaveis(_clinica uuid, _limite integer DEFAULT 2000)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok int := 0; v_nao int := 0; v_rest int;
BEGIN
  IF NOT public._imp_legado_eh_admin(_clinica) THEN
    RAISE EXCEPTION 'Somente administrador da unidade pode importar.' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.skip_telefone_check', '1', true);
  PERFORM set_config('app.skip_audit_importacao', '1', true);
  PERFORM set_config('app.actor_source', 'importacao_clinica_total', true);

  DROP TABLE IF EXISTS _lote_resp;
  CREATE TEMP TABLE _lote_resp ON COMMIT DROP AS
  SELECT l.codigo_pessoa, p.id AS paciente_id, r.nome, r.cpf, r.telefone
    FROM public.importacao_legado_responsaveis l
    LEFT JOIN LATERAL (SELECT id FROM public.pacientes WHERE clinica_id = _clinica
                         AND codigo_prontuario_anterior = l.codigo_pessoa ORDER BY created_at LIMIT 1) p ON true
    LEFT JOIN LATERAL (SELECT nome, cpf, telefone FROM public.pacientes WHERE clinica_id = _clinica
                         AND codigo_prontuario_anterior = l.codigo_responsavel ORDER BY created_at LIMIT 1) r ON true
   WHERE l.clinica_id = _clinica AND l.resultado IS NULL
   LIMIT greatest(1, least(_limite, 5000));

  UPDATE public.pacientes p SET
    responsavel_nome = coalesce(nullif(p.responsavel_nome,''), t.nome),
    responsavel_cpf = coalesce(nullif(p.responsavel_cpf,''), t.cpf),
    responsavel_telefone = coalesce(nullif(p.responsavel_telefone,''), t.telefone)
  FROM _lote_resp t
  WHERE p.id = t.paciente_id AND t.nome IS NOT NULL;

  UPDATE public.importacao_legado_responsaveis l
     SET resultado = CASE WHEN t.paciente_id IS NULL OR t.nome IS NULL THEN 'nao_encontrado' ELSE 'aplicado' END
    FROM _lote_resp t WHERE l.clinica_id = _clinica AND l.codigo_pessoa = t.codigo_pessoa;

  SELECT count(*) FILTER (WHERE paciente_id IS NOT NULL AND nome IS NOT NULL),
         count(*) FILTER (WHERE paciente_id IS NULL OR nome IS NULL) INTO v_ok, v_nao FROM _lote_resp;
  SELECT count(*) INTO v_rest FROM public.importacao_legado_responsaveis WHERE clinica_id = _clinica AND resultado IS NULL;

  IF v_ok + v_nao > 0 THEN
    INSERT INTO public.audit_log (clinica_id, user_id, user_email, table_name, record_id, action, dados_depois)
    VALUES (_clinica, auth.uid(), 'importacao_clinica_total', 'importacao_legado_responsaveis', _clinica::text, 'UPDATE',
            jsonb_build_object('aplicados', v_ok, 'nao_encontrados', v_nao));
  END IF;
  RETURN jsonb_build_object('aplicados', v_ok, 'nao_encontrados', v_nao, 'restantes', v_rest);
END;
$$;

CREATE OR REPLACE FUNCTION public.importacao_legado_associar_profissional(
  _clinica uuid, _codigo_pessoa text, _medico_id uuid, _sem_medico boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._imp_legado_eh_admin(_clinica) THEN
    RAISE EXCEPTION 'Somente administrador da unidade pode importar.' USING ERRCODE = '42501';
  END IF;
  IF _medico_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.medicos WHERE id = _medico_id AND clinica_id = _clinica) THEN
    RAISE EXCEPTION 'Médico não pertence a esta unidade.';
  END IF;
  UPDATE public.importacao_legado_profissionais
     SET medico_id = CASE WHEN _sem_medico THEN NULL ELSE _medico_id END,
         casado_por = CASE WHEN _sem_medico OR _medico_id IS NULL THEN NULL ELSE 'manual' END,
         sem_medico = coalesce(_sem_medico, false), updated_at = now()
   WHERE clinica_id = _clinica AND codigo_pessoa = _codigo_pessoa;
END;
$$;

CREATE OR REPLACE FUNCTION public.importacao_legado_resumo(_clinica uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._imp_legado_eh_admin(_clinica) THEN
    RAISE EXCEPTION 'Somente administrador da unidade pode importar.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'pacientes_importados', (SELECT count(*) FROM public.pacientes WHERE clinica_id = _clinica AND codigo_prontuario_anterior IS NOT NULL),
    'pacientes_inativos', (SELECT count(*) FROM public.pacientes WHERE clinica_id = _clinica AND codigo_prontuario_anterior IS NOT NULL AND NOT ativo),
    'prontuarios_importados', (SELECT count(*) FROM public.prontuarios WHERE clinica_id = _clinica AND legado_origem = 'clinica_total'),
    'prontuarios_sem_medico', (SELECT count(*) FROM public.prontuarios WHERE clinica_id = _clinica AND legado_origem = 'clinica_total' AND medico_id IS NULL),
    'observacoes_importadas', (SELECT count(*) FROM public.paciente_observacoes_legado WHERE clinica_id = _clinica AND legado_id LIKE 'obs:%'),
    'campos_extras_guardados', (SELECT count(*) FROM public.paciente_observacoes_legado WHERE clinica_id = _clinica AND legado_id LIKE 'pessoa:%'),
    'profissionais', (SELECT count(*) FROM public.importacao_legado_profissionais WHERE clinica_id = _clinica),
    'profissionais_casados', (SELECT count(*) FROM public.importacao_legado_profissionais WHERE clinica_id = _clinica AND medico_id IS NOT NULL),
    'responsaveis_aplicados', (SELECT count(*) FROM public.importacao_legado_responsaveis WHERE clinica_id = _clinica AND resultado = 'aplicado'),
    'responsaveis_nao_encontrados', (SELECT count(*) FROM public.importacao_legado_responsaveis WHERE clinica_id = _clinica AND resultado = 'nao_encontrado'),
    'responsaveis_pendentes', (SELECT count(*) FROM public.importacao_legado_responsaveis WHERE clinica_id = _clinica AND resultado IS NULL)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.importacao_legado_iniciar(uuid, text, text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.importacao_legado_concluir(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.importacao_legado_lote(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.importacao_legado_aplicar_responsaveis(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.importacao_legado_associar_profissional(uuid, text, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.importacao_legado_resumo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importacao_legado_iniciar(uuid, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importacao_legado_concluir(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importacao_legado_lote(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importacao_legado_aplicar_responsaveis(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importacao_legado_associar_profissional(uuid, text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importacao_legado_resumo(uuid) TO authenticated;
