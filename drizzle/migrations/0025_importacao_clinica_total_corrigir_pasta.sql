ALTER TABLE public.importacao_legado_execucoes DROP CONSTRAINT importacao_legado_execucoes_tipo_check;
ALTER TABLE public.importacao_legado_execucoes ADD CONSTRAINT importacao_legado_execucoes_tipo_check
  CHECK (tipo IN ('profissionais','pessoas','prontuarios','observacoes','corrigir_pasta'));
ALTER TABLE public.importacao_legado_execucoes ADD COLUMN fase text;

CREATE TABLE public.importacao_legado_pasta (
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id),
  codigo_pessoa text NOT NULL,
  paciente_id uuid,
  chave_original text,
  numero_chave bigint,
  motivo text,
  numero_final bigint,
  novo boolean NOT NULL DEFAULT false,
  aplicado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinica_id, codigo_pessoa)
);
CREATE INDEX ix_imp_legado_pasta_pend ON public.importacao_legado_pasta (clinica_id) WHERE NOT aplicado;
GRANT SELECT ON public.importacao_legado_pasta TO authenticated;
GRANT ALL ON public.importacao_legado_pasta TO service_role;
ALTER TABLE public.importacao_legado_pasta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imp_legado_pasta_admin_le" ON public.importacao_legado_pasta
  FOR SELECT TO authenticated USING (public._imp_legado_eh_admin(clinica_id));

CREATE OR REPLACE FUNCTION public._imp_chave_num(_t text)
RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN v ~ '^\d+$' AND ltrim(v, '0') <> '' AND length(ltrim(v, '0')) <= 7
              THEN ltrim(v, '0')::bigint END
    FROM (SELECT regexp_replace(coalesce(_t, ''), '\s', '', 'g') AS v) x;
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
  IF _tipo NOT IN ('profissionais','pessoas','prontuarios','observacoes','corrigir_pasta') THEN
    RAISE EXCEPTION 'Tipo de arquivo inválido.';
  END IF;
  v_anterior := CASE _tipo WHEN 'pessoas' THEN 'profissionais' WHEN 'prontuarios' THEN 'pessoas'
                           WHEN 'observacoes' THEN 'prontuarios' WHEN 'corrigir_pasta' THEN 'observacoes'
                           ELSE NULL END;
  IF v_anterior IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.importacao_legado_execucoes
     WHERE clinica_id = _clinica AND tipo = v_anterior AND status = 'concluido') THEN
    RAISE EXCEPTION 'Conclua antes a etapa "%".', v_anterior;
  END IF;
  IF _tipo = 'corrigir_pasta' AND EXISTS (
    SELECT 1 FROM public.importacao_legado_execucoes
     WHERE clinica_id = _clinica AND tipo = 'corrigir_pasta' AND status <> 'concluido'
       AND (arquivo_nome, arquivo_tamanho) IS DISTINCT FROM (_arquivo_nome, _arquivo_tamanho)) THEN
    RAISE EXCEPTION 'Já existe uma correção em andamento com outro arquivo. Escolha o mesmo arquivo para continuar.';
  END IF;
  INSERT INTO public.importacao_legado_execucoes (clinica_id, tipo, arquivo_nome, arquivo_tamanho, iniciado_por)
  VALUES (_clinica, _tipo, _arquivo_nome, _arquivo_tamanho, auth.uid())
  ON CONFLICT (clinica_id, tipo, arquivo_nome, arquivo_tamanho) DO UPDATE SET updated_at = now()
  RETURNING * INTO r;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.importacao_legado_pasta_lote(
  _execucao uuid, _linha_final integer, _linhas jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ex public.importacao_legado_execucoes;
  c uuid; it jsonb; d jsonb; n int;
  ins int := 0; upd int := 0; ign int := 0; err int := 0; v_lidas int := 0;
  v_cod text; v_nome text; v_cpf text; v_cpf_bruto text; v_nasc date; v_sexo text; v_pasta text;
  v_ativo boolean; v_created timestamptz; v_id uuid; v_qtd int; v_val text; v_campo text;
  v_chave text; v_num bigint; v_motivo text; v_novo boolean;
  v_avisos jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO ex FROM public.importacao_legado_execucoes WHERE id = _execucao FOR UPDATE;
  IF ex.id IS NULL OR ex.tipo <> 'corrigir_pasta' OR NOT public._imp_legado_eh_admin(ex.clinica_id) THEN
    RAISE EXCEPTION 'Somente administrador da unidade pode importar.' USING ERRCODE = '42501';
  END IF;
  IF ex.status = 'concluido' THEN RAISE EXCEPTION 'Esta etapa já foi concluída.'; END IF;
  IF ex.fase IS NOT NULL THEN
    RAISE EXCEPTION 'A leitura do arquivo já terminou e a troca dos números começou. Clique em "Iniciar / continuar" para seguir.';
  END IF;
  c := ex.clinica_id;
  IF _linha_final <= ex.ultima_linha THEN
    RETURN jsonb_build_object('ja_processado', true, 'ultima_linha', ex.ultima_linha, 'total', to_jsonb(ex));
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(_linhas, '[]'::jsonb)) x
              WHERE x ? 'd' AND NOT (x->'d') ? 'chave') THEN
    RAISE EXCEPTION 'Arquivo de pessoas sem o campo "chave" (número da pasta). Use o arquivo pessoas_v2.jsonl.';
  END IF;

  PERFORM set_config('app.skip_telefone_check', '1', true);
  PERFORM set_config('app.skip_audit_importacao', '1', true);
  PERFORM set_config('app.actor_source', 'importacao_clinica_total', true);

  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_linhas, '[]'::jsonb)) LOOP
    n := (it->>'n')::int;
    IF n <= ex.ultima_linha THEN CONTINUE; END IF;
    v_lidas := v_lidas + 1;
    v_cod := NULL; v_nome := NULL;
    IF it ? 'e' THEN
      err := err + 1;
      INSERT INTO public.importacao_legado_erros (execucao_id, clinica_id, linha, tipo, motivo)
      VALUES (_execucao, c, n, 'erro', left(it->>'e', 300));
      CONTINUE;
    END IF;
    d := it->'d';
    BEGIN
      v_cod := public._imp_txt(d, 'codigo_pessoa');
      IF v_cod IS NULL THEN RAISE EXCEPTION 'sem codigo_pessoa'; END IF;
      v_nome := public._imp_txt(d, 'nome');
      v_chave := public._imp_txt(d, 'chave');
      v_num := public._imp_chave_num(v_chave);
      v_val := regexp_replace(coalesce(v_chave, ''), '\s', '', 'g');
      v_motivo := CASE WHEN v_num IS NOT NULL THEN NULL
                       WHEN v_val ~ '^\d+$' AND ltrim(v_val, '0') <> '' THEN 'Pasta (chave) com mais de 7 dígitos'
                       ELSE 'Pasta (chave) vazia, não numérica ou zerada' END;

      IF EXISTS (SELECT 1 FROM public.pacientes p WHERE p.clinica_id = c AND p.codigo_prontuario_anterior = v_cod
                    AND p.origem IS DISTINCT FROM 'importacao_clinica_total') THEN
        ign := ign + 1;
        CONTINUE;
      END IF;

      v_id := NULL; v_novo := false;
      SELECT p.id INTO v_id FROM public.pacientes p
       WHERE p.clinica_id = c AND p.codigo_prontuario_anterior = v_cod AND p.origem = 'importacao_clinica_total'
       ORDER BY p.created_at LIMIT 1;

      IF v_id IS NOT NULL THEN
        upd := upd + 1;
      ELSE
        IF v_nome IS NULL THEN RAISE EXCEPTION 'sem nome'; END IF;
        v_cpf_bruto := public._imp_txt(d, 'cpf_cnpj');
        v_cpf := regexp_replace(coalesce(v_cpf_bruto,''), '\D', '', 'g');
        IF length(v_cpf) NOT IN (11, 14) OR v_cpf ~ '^(\d)\1+$' THEN v_cpf := NULL; END IF;
        v_nasc := public._imp_date(d->>'nascimento_abertura');

        SELECT min(p.id::text)::uuid, count(*) INTO v_id, v_qtd FROM public.pacientes p
         WHERE p.clinica_id = c AND p.codigo_prontuario_anterior IS NULL
           AND ((v_cpf IS NOT NULL AND p.cpf_digits = v_cpf)
             OR (v_cpf IS NULL AND v_nasc IS NOT NULL AND p.data_nascimento = v_nasc
                 AND upper(public.strip_accents(btrim(p.nome))) = public._imp_norm_nome(v_nome)));
        IF v_qtd = 1 THEN
          UPDATE public.pacientes SET codigo_prontuario_anterior = v_cod WHERE id = v_id;
          v_avisos := v_avisos || jsonb_build_object('n', n, 'k', v_cod,
            'm', 'Ligado a cadastro já existente no ClinicaOS (CPF ou nome + nascimento); número dele não muda');
          ign := ign + 1;
          CONTINUE;
        END IF;
        v_id := NULL;

        IF v_cpf IS NOT NULL AND EXISTS (SELECT 1 FROM public.pacientes p WHERE p.clinica_id = c AND p.cpf = v_cpf) THEN
          v_avisos := v_avisos || jsonb_build_object('n', n, 'k', v_cod, 'm', 'CPF já usado por outro cadastro; guardado nas observações legadas');
          v_cpf := NULL;
        END IF;
        v_sexo := CASE upper(left(btrim(coalesce(d->>'sexo','')), 1))
                    WHEN 'M' THEN 'masculino' WHEN 'F' THEN 'feminino' ELSE 'nao_informar' END;
        v_pasta := coalesce(public._imp_txt(d, 'pasta_ortodontica'), public._imp_txt(d, 'pasta_financeira'));
        v_ativo := upper(coalesce(public._imp_txt(d, 'ativo'), 'S')) <> 'N';
        v_created := public._imp_ts(d->>'data_cadastro');
        BEGIN
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
            v_pasta, public._imp_txt(d,'pasta_ortodontica'), v_ativo, coalesce(v_created, now()),
            'IMP-PROV-' || v_cod, v_cod, 'importacao_clinica_total')
          RETURNING id INTO v_id;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION '% — nome: %', SQLERRM, left(coalesce(v_nome, ''), 120);
        END;
        ins := ins + 1; v_novo := true;
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
      END IF;

      IF v_chave IS NOT NULL THEN
        INSERT INTO public.paciente_observacoes_legado (clinica_id, paciente_id, legado_id, tipo, texto)
        VALUES (c, v_id, 'pessoa:' || v_cod || ':chave', 'chave', v_chave)
        ON CONFLICT (clinica_id, origem, legado_id) DO UPDATE SET texto = excluded.texto, paciente_id = excluded.paciente_id;
      END IF;

      INSERT INTO public.importacao_legado_pasta (clinica_id, codigo_pessoa, paciente_id, chave_original, numero_chave, motivo, novo)
      VALUES (c, v_cod, v_id, v_chave, v_num, v_motivo, v_novo)
      ON CONFLICT (clinica_id, codigo_pessoa) DO UPDATE
        SET paciente_id = excluded.paciente_id, chave_original = excluded.chave_original,
            numero_chave = excluded.numero_chave, motivo = excluded.motivo;
    EXCEPTION WHEN OTHERS THEN
      err := err + 1;
      INSERT INTO public.importacao_legado_erros (execucao_id, clinica_id, linha, chave, tipo, motivo)
      VALUES (_execucao, c, n, v_cod, 'erro', left(SQLERRM, 300));
    END;
  END LOOP;

  INSERT INTO public.importacao_legado_erros (execucao_id, clinica_id, linha, chave, tipo, motivo)
  SELECT _execucao, c, (a->>'n')::int, a->>'k', 'aviso', a->>'m' FROM jsonb_array_elements(v_avisos) a;

  UPDATE public.importacao_legado_execucoes SET
    ultima_linha = _linha_final, lidas = lidas + v_lidas,
    inseridas = inseridas + ins, atualizadas = atualizadas + upd, ignoradas = ignoradas + ign,
    erros = erros + err, updated_at = now()
  WHERE id = _execucao RETURNING * INTO ex;

  INSERT INTO public.audit_log (clinica_id, user_id, user_email, table_name, record_id, action, dados_depois)
  VALUES (c, auth.uid(), 'importacao_clinica_total', 'importacao_legado_corrigir_pasta', _execucao::text, 'UPDATE',
    jsonb_build_object('fase', 'leitura', 'linha_final', _linha_final, 'lidas', v_lidas, 'novos', ins,
                       'a_corrigir', upd, 'ignoradas', ign, 'erros', err));

  RETURN jsonb_build_object('ja_processado', false, 'ultima_linha', ex.ultima_linha,
    'lote', jsonb_build_object('lidas', v_lidas, 'inseridas', ins, 'atualizadas', upd, 'ignoradas', ign, 'erros', err),
    'total', to_jsonb(ex));
END;
$$;

CREATE OR REPLACE FUNCTION public.importacao_legado_pasta_aplicar(_execucao uuid, _limite integer DEFAULT 5000)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ex public.importacao_legado_execucoes;
  c uuid; v_feitos int := 0; v_rest int := 0; v_base bigint; v_max bigint; v_lim int;
BEGIN
  SELECT * INTO ex FROM public.importacao_legado_execucoes WHERE id = _execucao FOR UPDATE;
  IF ex.id IS NULL OR ex.tipo <> 'corrigir_pasta' OR NOT public._imp_legado_eh_admin(ex.clinica_id) THEN
    RAISE EXCEPTION 'Somente administrador da unidade pode importar.' USING ERRCODE = '42501';
  END IF;
  IF ex.status = 'concluido' OR ex.fase = 'aplicado' THEN
    RETURN jsonb_build_object('fase', 'aplicado', 'feitos', 0, 'restantes', 0);
  END IF;
  IF ex.ultima_linha = 0 THEN RAISE EXCEPTION 'Leia o arquivo pessoas_v2.jsonl antes.'; END IF;
  c := ex.clinica_id;
  v_lim := greatest(1, least(coalesce(_limite, 5000), 20000));
  PERFORM set_config('app.skip_telefone_check', '1', true);
  PERFORM set_config('app.skip_audit_importacao', '1', true);
  PERFORM set_config('app.actor_source', 'importacao_clinica_total', true);
  PERFORM pg_advisory_xact_lock(hashtext('pac_codigo:' || c::text));

  IF ex.fase IS NULL THEN
    UPDATE public.importacao_legado_execucoes SET fase = 'provisorio', updated_at = now() WHERE id = _execucao;
    ex.fase := 'provisorio';
  END IF;

  IF ex.fase = 'provisorio' THEN
    UPDATE public.pacientes p SET codigo_prontuario = 'IMP-PROV-' || p.codigo_prontuario_anterior
     WHERE p.id IN (SELECT id FROM public.pacientes
                     WHERE clinica_id = c AND origem = 'importacao_clinica_total'
                       AND codigo_prontuario_anterior IS NOT NULL
                       AND codigo_prontuario NOT LIKE 'IMP-PROV-%'
                     LIMIT v_lim);
    GET DIAGNOSTICS v_feitos = ROW_COUNT;
    IF v_feitos > 0 THEN
      INSERT INTO public.audit_log (clinica_id, user_id, user_email, table_name, record_id, action, dados_depois)
      VALUES (c, auth.uid(), 'importacao_clinica_total', 'importacao_legado_corrigir_pasta', _execucao::text, 'UPDATE',
              jsonb_build_object('fase', 'provisorio', 'pacientes', v_feitos));
      RETURN jsonb_build_object('fase', 'provisorio', 'feitos', v_feitos, 'restantes', NULL);
    END IF;

    INSERT INTO public.importacao_legado_pasta (clinica_id, codigo_pessoa, paciente_id, motivo)
    SELECT c, p.codigo_prontuario_anterior, p.id, 'Cliente não está no arquivo pessoas_v2'
      FROM public.pacientes p
     WHERE p.clinica_id = c AND p.origem = 'importacao_clinica_total' AND p.codigo_prontuario LIKE 'IMP-PROV-%'
    ON CONFLICT (clinica_id, codigo_pessoa) DO NOTHING;
    UPDATE public.importacao_legado_pasta s SET paciente_id = p.id
      FROM public.pacientes p
     WHERE s.clinica_id = c AND p.clinica_id = c AND p.origem = 'importacao_clinica_total'
       AND p.codigo_prontuario_anterior = s.codigo_pessoa AND p.codigo_prontuario LIKE 'IMP-PROV-%'
       AND s.paciente_id IS DISTINCT FROM p.id;
    UPDATE public.importacao_legado_pasta SET numero_final = NULL, aplicado = false WHERE clinica_id = c;
    UPDATE public.importacao_legado_pasta SET aplicado = true WHERE clinica_id = c AND paciente_id IS NULL;

    DROP TABLE IF EXISTS _ocupados;
    CREATE TEMP TABLE _ocupados ON COMMIT DROP AS
      SELECT codigo_prontuario::bigint AS num FROM public.pacientes
       WHERE clinica_id = c AND codigo_prontuario ~ '^\d{1,7}$';
    CREATE INDEX ON _ocupados (num);

    WITH r AS (
      SELECT s.codigo_pessoa,
             row_number() OVER (PARTITION BY s.numero_chave
               ORDER BY CASE WHEN s.codigo_pessoa ~ '^\d+$' THEN s.codigo_pessoa::numeric END NULLS LAST, s.codigo_pessoa) AS rn
        FROM public.importacao_legado_pasta s
       WHERE s.clinica_id = c AND s.paciente_id IS NOT NULL AND s.numero_chave IS NOT NULL)
    UPDATE public.importacao_legado_pasta s SET
      numero_final = CASE WHEN r.rn = 1 AND NOT EXISTS (SELECT 1 FROM _ocupados o WHERE o.num = s.numero_chave)
                          THEN s.numero_chave END,
      motivo = CASE WHEN r.rn > 1 THEN 'Pasta ' || s.numero_chave || ' repetida: fica com o menor código antigo'
                    WHEN EXISTS (SELECT 1 FROM _ocupados o WHERE o.num = s.numero_chave)
                      THEN 'Pasta ' || s.numero_chave || ' já usada por cadastro do ClinicaOS'
                    ELSE NULL END
      FROM r WHERE s.clinica_id = c AND s.codigo_pessoa = r.codigo_pessoa;

    SELECT greatest(coalesce((SELECT max(numero_final) FROM public.importacao_legado_pasta WHERE clinica_id = c), 0),
                    coalesce((SELECT max(num) FROM _ocupados), 0)) INTO v_base;
    WITH pend AS (
      SELECT codigo_pessoa, row_number() OVER (
               ORDER BY CASE WHEN codigo_pessoa ~ '^\d+$' THEN codigo_pessoa::numeric END NULLS LAST, codigo_pessoa) AS rn
        FROM public.importacao_legado_pasta
       WHERE clinica_id = c AND paciente_id IS NOT NULL AND numero_final IS NULL)
    UPDATE public.importacao_legado_pasta s SET numero_final = v_base + pend.rn
      FROM pend WHERE s.clinica_id = c AND s.codigo_pessoa = pend.codigo_pessoa;
    IF (SELECT max(numero_final) FROM public.importacao_legado_pasta WHERE clinica_id = c) > 9999999 THEN
      RAISE EXCEPTION 'A numeração de prontuário passaria do limite de 7 dígitos nesta clínica.';
    END IF;

    INSERT INTO public.importacao_legado_erros (execucao_id, clinica_id, chave, tipo, motivo)
    SELECT _execucao, c, s.codigo_pessoa, 'aviso',
           left(s.motivo || '; ganhou o número ' || s.numero_final ||
                coalesce(' (chave original: ' || s.chave_original || ')', ''), 300)
      FROM public.importacao_legado_pasta s
     WHERE s.clinica_id = c AND s.paciente_id IS NOT NULL AND s.numero_final <> coalesce(s.numero_chave, -1);

    UPDATE public.importacao_legado_execucoes SET fase = 'aplicando', updated_at = now() WHERE id = _execucao;
    RETURN jsonb_build_object('fase', 'aplicando', 'feitos', 0, 'restantes',
      (SELECT count(*) FROM public.importacao_legado_pasta WHERE clinica_id = c AND NOT aplicado));
  END IF;

  WITH lote AS (
    SELECT codigo_pessoa, paciente_id, numero_final FROM public.importacao_legado_pasta
     WHERE clinica_id = c AND NOT aplicado LIMIT v_lim),
  u AS (
    UPDATE public.pacientes p SET codigo_prontuario = l.numero_final::text
      FROM lote l WHERE p.id = l.paciente_id AND p.codigo_prontuario LIKE 'IMP-PROV-%' RETURNING p.id)
  UPDATE public.importacao_legado_pasta s SET aplicado = true
    FROM lote l WHERE s.clinica_id = c AND s.codigo_pessoa = l.codigo_pessoa;
  GET DIAGNOSTICS v_feitos = ROW_COUNT;
  SELECT count(*) INTO v_rest FROM public.importacao_legado_pasta WHERE clinica_id = c AND NOT aplicado;

  IF v_feitos > 0 THEN
    INSERT INTO public.audit_log (clinica_id, user_id, user_email, table_name, record_id, action, dados_depois)
    VALUES (c, auth.uid(), 'importacao_clinica_total', 'importacao_legado_corrigir_pasta', _execucao::text, 'UPDATE',
            jsonb_build_object('fase', 'aplicando', 'pacientes', v_feitos));
  END IF;

  IF v_rest = 0 THEN
    IF EXISTS (SELECT 1 FROM public.pacientes WHERE clinica_id = c AND codigo_prontuario LIKE 'IMP-PROV-%') THEN
      RAISE EXCEPTION 'Sobrou cliente com número provisório. Fale com o suporte antes de concluir.';
    END IF;
    SELECT coalesce(max(codigo_prontuario::bigint), 0) INTO v_max FROM public.pacientes
     WHERE clinica_id = c AND codigo_prontuario ~ '^\d{1,7}$';
    INSERT INTO public.prontuario_sequencia (clinica_id, proximo) VALUES (c, v_max + 1)
    ON CONFLICT (clinica_id) DO UPDATE SET proximo = v_max + 1, atualizado_em = now();
    UPDATE public.importacao_legado_execucoes SET fase = 'aplicado', updated_at = now() WHERE id = _execucao;
    RETURN jsonb_build_object('fase', 'aplicado', 'feitos', v_feitos, 'restantes', 0);
  END IF;
  RETURN jsonb_build_object('fase', 'aplicando', 'feitos', v_feitos, 'restantes', v_rest);
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
  IF r.tipo = 'corrigir_pasta' AND r.fase IS DISTINCT FROM 'aplicado' THEN
    RAISE EXCEPTION 'A troca dos números ainda não terminou. Clique em "Iniciar / continuar" para terminar.';
  END IF;
  UPDATE public.importacao_legado_execucoes
     SET status = 'concluido', concluido_em = now(), updated_at = now()
   WHERE id = _execucao RETURNING * INTO r;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.importacao_legado_reaplicar_profissional(_clinica uuid, _codigo_pessoa text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_med uuid; v_nome text; v_unico boolean; v_qtd int := 0;
  esc text := '\';
BEGIN
  IF NOT public._imp_legado_eh_admin(_clinica) THEN
    RAISE EXCEPTION 'Somente administrador da unidade pode importar.' USING ERRCODE = '42501';
  END IF;
  SELECT medico_id, nome INTO v_med, v_nome FROM public.importacao_legado_profissionais
   WHERE clinica_id = _clinica AND codigo_pessoa = _codigo_pessoa;
  IF v_med IS NULL THEN RETURN jsonb_build_object('atualizados', 0, 'nome_repetido', false); END IF;
  SELECT count(*) = 1 INTO v_unico FROM public.importacao_legado_profissionais
   WHERE clinica_id = _clinica AND upper(public.strip_accents(btrim(nome))) = upper(public.strip_accents(btrim(v_nome)));
  PERFORM set_config('app.skip_audit_importacao', '1', true);
  PERFORM set_config('app.actor_source', 'importacao_clinica_total', true);
  UPDATE public.prontuarios SET medico_id = v_med
   WHERE clinica_id = _clinica AND legado_origem = 'clinica_total' AND medico_id IS NULL
     AND ( (E'\n' || observacoes || E'\n') LIKE
             '%' || E'\nPROFISSIONAL (CODIGO ANTIGO): ' || replace(replace(replace(upper(_codigo_pessoa), esc, esc||esc), '%', esc||'%'), '_', esc||'_') || E'\n%'
        OR (v_unico AND v_nome IS NOT NULL AND (E'\n' || observacoes || E'\n') LIKE
             '%' || E'\nPROFISSIONAL: ' || replace(replace(replace(upper(public.strip_accents(btrim(v_nome))), esc, esc||esc), '%', esc||'%'), '_', esc||'_') || E'\n%') );
  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  IF v_qtd > 0 THEN
    INSERT INTO public.audit_log (clinica_id, user_id, user_email, table_name, record_id, action, dados_depois)
    VALUES (_clinica, auth.uid(), 'importacao_clinica_total', 'importacao_legado_profissional_prontuarios', _codigo_pessoa, 'UPDATE',
            jsonb_build_object('medico_id', v_med, 'prontuarios', v_qtd));
  END IF;
  RETURN jsonb_build_object('atualizados', v_qtd, 'nome_repetido', NOT v_unico);
END;
$$;

CREATE OR REPLACE FUNCTION public.importacao_legado_problemas(_clinica uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._imp_legado_eh_admin(_clinica) THEN
    RAISE EXCEPTION 'Somente administrador da unidade pode importar.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'sem_cadastro', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('codigo_pessoa', x.chave, 'motivo', x.motivo, 'nome', x.nome)
                                ORDER BY x.chave), '[]'::jsonb)
        FROM (SELECT DISTINCT ON (e.chave) e.chave,
                     CASE WHEN e.motivo LIKE 'sem nome%' THEN 'Sem nome' ELSE 'Nome inválido' END AS motivo,
                     (SELECT substring(e2.motivo FROM ' — nome: (.*)$') FROM public.importacao_legado_erros e2
                       JOIN public.importacao_legado_execucoes x2 ON x2.id = e2.execucao_id AND x2.tipo = 'corrigir_pasta'
                      WHERE e2.clinica_id = _clinica AND e2.chave = e.chave AND e2.motivo LIKE '% — nome: %'
                      ORDER BY e2.id DESC LIMIT 1) AS nome
                FROM public.importacao_legado_erros e
                JOIN public.importacao_legado_execucoes x ON x.id = e.execucao_id AND x.tipo IN ('pessoas','corrigir_pasta')
               WHERE e.clinica_id = _clinica AND e.tipo = 'erro' AND e.chave IS NOT NULL
                 AND (e.motivo LIKE 'Nome inválido%' OR e.motivo LIKE 'sem nome%')
                 AND NOT EXISTS (SELECT 1 FROM public.pacientes p WHERE p.clinica_id = _clinica
                                  AND p.codigo_prontuario_anterior = e.chave)
               ORDER BY e.chave, e.id DESC) x),
    'cpf_repetidos', (SELECT count(*) FROM public.importacao_legado_erros
                       WHERE clinica_id = _clinica AND tipo = 'aviso' AND motivo LIKE 'CPF já usado%'),
    'prontuarios_orfaos', (SELECT count(*) FROM public.importacao_legado_erros e
                            JOIN public.importacao_legado_execucoes x ON x.id = e.execucao_id AND x.tipo = 'prontuarios'
                           WHERE e.clinica_id = _clinica AND e.tipo = 'orfao'),
    'observacoes_orfas', (SELECT count(*) FROM public.importacao_legado_erros e
                           JOIN public.importacao_legado_execucoes x ON x.id = e.execucao_id AND x.tipo = 'observacoes'
                          WHERE e.clinica_id = _clinica AND e.tipo = 'orfao'),
    'profissionais', (SELECT count(*) FROM public.importacao_legado_profissionais WHERE clinica_id = _clinica),
    'profissionais_casados', (SELECT count(*) FROM public.importacao_legado_profissionais WHERE clinica_id = _clinica AND medico_id IS NOT NULL),
    'prontuarios_sem_medico', (SELECT count(*) FROM public.prontuarios WHERE clinica_id = _clinica AND legado_origem = 'clinica_total' AND medico_id IS NULL),
    'prontuarios_sem_medico_com_profissional', (SELECT count(*) FROM public.prontuarios WHERE clinica_id = _clinica
        AND legado_origem = 'clinica_total' AND medico_id IS NULL AND observacoes LIKE '%PROFISSIONAL%')
  );
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
    'responsaveis_pendentes', (SELECT count(*) FROM public.importacao_legado_responsaveis WHERE clinica_id = _clinica AND resultado IS NULL),
    'pasta_atualizados', (SELECT count(*) FROM public.importacao_legado_pasta WHERE clinica_id = _clinica AND aplicado AND paciente_id IS NOT NULL AND NOT novo),
    'pasta_novos', (SELECT count(*) FROM public.importacao_legado_pasta WHERE clinica_id = _clinica AND paciente_id IS NOT NULL AND novo),
    'pasta_numeros_gerados', (SELECT count(*) FROM public.importacao_legado_pasta WHERE clinica_id = _clinica AND paciente_id IS NOT NULL
                                AND numero_final IS NOT NULL AND numero_final <> coalesce(numero_chave, -1)),
    'pasta_avisos', (SELECT count(*) FROM public.importacao_legado_erros e JOIN public.importacao_legado_execucoes x
                       ON x.id = e.execucao_id AND x.tipo = 'corrigir_pasta' WHERE e.clinica_id = _clinica AND e.tipo = 'aviso'),
    'pasta_pendentes', (SELECT count(*) FROM public.importacao_legado_pasta WHERE clinica_id = _clinica AND NOT aplicado)
  );
END;
$$;

REVOKE ALL ON FUNCTION public._imp_chave_num(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.importacao_legado_pasta_lote(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.importacao_legado_pasta_aplicar(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.importacao_legado_reaplicar_profissional(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.importacao_legado_problemas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._imp_chave_num(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importacao_legado_pasta_lote(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importacao_legado_pasta_aplicar(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importacao_legado_reaplicar_profissional(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importacao_legado_problemas(uuid) TO authenticated;