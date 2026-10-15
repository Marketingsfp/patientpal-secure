CREATE TABLE public.importacao_legado_numeracao (
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id),
  codigo_pessoa text NOT NULL,
  paciente_id uuid NOT NULL,
  chave_original text,
  motivo text NOT NULL,
  numero_novo bigint,
  numerado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinica_id, codigo_pessoa)
);
CREATE INDEX ix_imp_legado_num_pend ON public.importacao_legado_numeracao (clinica_id) WHERE numerado_em IS NULL;
GRANT SELECT ON public.importacao_legado_numeracao TO authenticated;
GRANT ALL ON public.importacao_legado_numeracao TO service_role;
ALTER TABLE public.importacao_legado_numeracao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imp_legado_num_admin_le" ON public.importacao_legado_numeracao
  FOR SELECT TO authenticated USING (public._imp_legado_eh_admin(clinica_id));

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
  v_chave text; v_num bigint; v_pend text; v_dono_id uuid; v_dono_cod text; v_dono_origem text;
BEGIN
  SELECT * INTO ex FROM public.importacao_legado_execucoes WHERE id = _execucao FOR UPDATE;
  IF ex.id IS NULL OR NOT public._imp_legado_eh_admin(ex.clinica_id) THEN
    RAISE EXCEPTION 'Somente administrador da unidade pode importar.' USING ERRCODE = '42501';
  END IF;
  IF ex.status = 'concluido' THEN RAISE EXCEPTION 'Esta etapa já foi concluída.'; END IF;
  c := ex.clinica_id;
  IF _linha_final <= ex.ultima_linha THEN
    RETURN jsonb_build_object('ja_processado', true, 'ultima_linha', ex.ultima_linha, 'total', to_jsonb(ex));
  END IF;

  PERFORM set_config('app.skip_telefone_check', '1', true);
  PERFORM set_config('app.skip_audit_importacao', '1', true);
  PERFORM set_config('app.actor_source', 'importacao_clinica_total', true);

  -- Arquivo de pessoas antigo (sem o campo "chave" = número da pasta): recusa o lote inteiro.
  IF ex.tipo = 'pessoas' AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(coalesce(_linhas, '[]'::jsonb)) x
        WHERE x ? 'd' AND NOT (x->'d') ? 'chave') THEN
    RAISE EXCEPTION 'Arquivo de pessoas sem o campo "chave" (número da pasta). Use o arquivo pessoas_v2.jsonl.';
  END IF;

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
          -- Número da pasta = campo "chave" (só dígitos, sem zeros à esquerda).
          v_codpr := NULL; v_pend := NULL; v_dono_id := NULL;
          v_chave := public._imp_txt(d, 'chave');
          v_val := regexp_replace(coalesce(v_chave, ''), '\s', '', 'g');
          IF v_val !~ '^\d+$' OR ltrim(v_val, '0') = '' THEN
            v_pend := 'Pasta (chave) vazia, não numérica ou zerada; o sistema vai gerar outro número';
          ELSIF length(ltrim(v_val, '0')) > 7 THEN
            v_pend := 'Pasta (chave) com mais de 7 dígitos; o sistema vai gerar outro número';
          ELSE
            v_num := ltrim(v_val, '0')::bigint;
            SELECT p.id, p.codigo_prontuario_anterior, p.origem INTO v_dono_id, v_dono_cod, v_dono_origem
              FROM public.pacientes p
             WHERE p.clinica_id = c AND p.codigo_prontuario ~ '^\d{1,7}$' AND p.codigo_prontuario::bigint = v_num
             LIMIT 1;
            IF v_dono_id IS NULL THEN
              v_codpr := v_num::text;
            ELSIF v_dono_origem = 'importacao_clinica_total' AND v_dono_cod ~ '^\d+$' AND v_cod ~ '^\d+$'
                  AND v_dono_cod::numeric > v_cod::numeric THEN
              UPDATE public.pacientes SET codigo_prontuario = 'IMP-PEND-' || v_dono_cod WHERE id = v_dono_id;
              INSERT INTO public.importacao_legado_numeracao (clinica_id, codigo_pessoa, paciente_id, chave_original, motivo)
              VALUES (c, v_dono_cod, v_dono_id, v_num::text, 'chave_repetida')
              ON CONFLICT (clinica_id, codigo_pessoa) DO NOTHING;
              v_avisos := v_avisos || jsonb_build_object('n', n, 'k', v_dono_cod,
                'm', 'Pasta ' || v_num || ' repetida: fica com o código ' || v_cod || ' (menor); este cliente ganha número novo');
              v_codpr := v_num::text;
            ELSE
              v_pend := 'Pasta ' || v_num || ' repetida ou já usada por outro cadastro; o sistema vai gerar outro número';
            END IF;
          END IF;
          IF v_pend IS NOT NULL THEN
            v_codpr := 'IMP-PEND-' || v_cod;
            v_avisos := v_avisos || jsonb_build_object('n', n, 'k', v_cod, 'm', v_pend);
          ELSE
            v_max := greatest(v_max, v_codpr::bigint);
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
          IF v_pend IS NOT NULL THEN
            INSERT INTO public.importacao_legado_numeracao (clinica_id, codigo_pessoa, paciente_id, chave_original, motivo)
            VALUES (c, v_cod, v_id, v_chave, CASE WHEN v_pend LIKE 'Pasta (chave)%' THEN 'chave_invalida' ELSE 'chave_repetida' END)
            ON CONFLICT (clinica_id, codigo_pessoa) DO NOTHING;
          END IF;
        END IF;

        FOREACH v_campo IN ARRAY ARRAY['nome_mae','nome_pai','observacao','observacao_clinica',
                                       'cartao_numero','rg_ie','pasta_financeira','chave'] LOOP
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
    'numeros_novos_gerados', (SELECT count(*) FROM public.importacao_legado_numeracao WHERE clinica_id = _clinica AND numerado_em IS NOT NULL),
    'numeros_pendentes', (SELECT count(*) FROM public.importacao_legado_numeracao WHERE clinica_id = _clinica AND numerado_em IS NULL),
    'responsaveis_pendentes', (SELECT count(*) FROM public.importacao_legado_responsaveis WHERE clinica_id = _clinica AND resultado IS NULL)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.importacao_legado_numerar_pendentes(_clinica uuid, _limite integer DEFAULT 2000)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; v_base bigint; v_feitos int := 0; v_rest int;
BEGIN
  IF NOT public._imp_legado_eh_admin(_clinica) THEN
    RAISE EXCEPTION 'Somente administrador da unidade pode importar.' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.skip_audit_importacao', '1', true);
  PERFORM set_config('app.actor_source', 'importacao_clinica_total', true);
  PERFORM pg_advisory_xact_lock(hashtext('pac_codigo:' || _clinica::text));
  SELECT coalesce(max(codigo_prontuario::bigint), 0) INTO v_base FROM public.pacientes
   WHERE clinica_id = _clinica AND codigo_prontuario ~ '^\d{1,7}$';
  FOR r IN SELECT * FROM public.importacao_legado_numeracao
            WHERE clinica_id = _clinica AND numerado_em IS NULL
            ORDER BY CASE WHEN codigo_pessoa ~ '^\d+$' THEN codigo_pessoa::numeric END NULLS LAST, codigo_pessoa
            LIMIT greatest(_limite, 1) LOOP
    v_base := v_base + 1;
    IF v_base > 9999999 THEN
      RAISE EXCEPTION 'A numeração de prontuário chegou ao limite de 7 dígitos nesta clínica.';
    END IF;
    UPDATE public.pacientes SET codigo_prontuario = v_base::text
     WHERE id = r.paciente_id AND codigo_prontuario LIKE 'IMP-PEND-%';
    UPDATE public.importacao_legado_numeracao SET numero_novo = v_base, numerado_em = now()
     WHERE clinica_id = r.clinica_id AND codigo_pessoa = r.codigo_pessoa;
    v_feitos := v_feitos + 1;
  END LOOP;
  INSERT INTO public.prontuario_sequencia (clinica_id, proximo) VALUES (_clinica, v_base + 1)
  ON CONFLICT (clinica_id) DO UPDATE
    SET proximo = greatest(public.prontuario_sequencia.proximo, v_base + 1), atualizado_em = now();
  SELECT count(*) INTO v_rest FROM public.importacao_legado_numeracao WHERE clinica_id = _clinica AND numerado_em IS NULL;
  RETURN jsonb_build_object('numerados', v_feitos, 'restantes', v_rest);
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
  IF r.tipo = 'pessoas' AND EXISTS (SELECT 1 FROM public.importacao_legado_numeracao
                                     WHERE clinica_id = r.clinica_id AND numerado_em IS NULL) THEN
    RAISE EXCEPTION 'Ainda há clientes aguardando número de prontuário novo. Clique em "Iniciar / continuar" para terminar.';
  END IF;
  UPDATE public.importacao_legado_execucoes
     SET status = 'concluido', concluido_em = now(), updated_at = now()
   WHERE id = _execucao RETURNING * INTO r;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.importacao_legado_numerar_pendentes(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importacao_legado_numerar_pendentes(uuid, integer) TO authenticated;