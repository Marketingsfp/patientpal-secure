-- Cartão Benefícios / Terapêutico: histórico das importações por planilha e "Desfazer importação".
-- Aditiva: duas tabelas novas e cinco funções. Nenhum dado existente é alterado por esta migração.
--
-- Cada importação vira um lote, e tudo o que ela CRIOU (paciente titular, paciente dependente,
-- contrato, vínculo de dependente) fica anotado no lote. Quem já existia e foi reaproveitado não
-- é anotado — por isso o desfazer nunca toca nele.
--
-- Desfazer só apaga se nada do lote foi usado depois: qualquer linha, em qualquer tabela, que
-- aponte para um desses pacientes ou contratos (agenda, financeiro, prontuário, mensalidade,
-- outro cartão...) trava o desfazer inteiro e a lista de quem travou volta para a tela. A busca
-- é feita pelo catálogo do banco, então tabela nova criada no futuro também entra na checagem.
-- Os registros apagados continuam no audit_log (gatilho de DELETE grava o dado anterior).

CREATE TABLE IF NOT EXISTS public.cb_importacao_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id),
  produto text NOT NULL CHECK (produto IN ('beneficios','terapeutico')),
  convenio_id uuid REFERENCES public.cb_convenios(id) ON DELETE SET NULL,
  arquivo_nome text NOT NULL,
  status text NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento','concluido','revertido')),
  pendencias integer NOT NULL DEFAULT 0,
  criado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  revertido_por uuid,
  revertido_em timestamptz,
  removidos jsonb
);
CREATE INDEX IF NOT EXISTS ix_cb_importacao_lotes_clinica
  ON public.cb_importacao_lotes (clinica_id, produto, created_at DESC);

CREATE TABLE IF NOT EXISTS public.cb_importacao_lote_itens (
  lote_id uuid NOT NULL REFERENCES public.cb_importacao_lotes(id) ON DELETE CASCADE,
  -- titular / dependente = pacientes.id; contrato = contratos_assinatura.id; vinculo = contrato_dependentes.id
  tipo text NOT NULL CHECK (tipo IN ('titular','dependente','contrato','vinculo')),
  registro_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lote_id, tipo, registro_id)
);
CREATE INDEX IF NOT EXISTS ix_cb_importacao_lote_itens_registro
  ON public.cb_importacao_lote_itens (registro_id);

-- Acesso só pelas funções abaixo: a tela nunca lê nem grava estas tabelas direto.
ALTER TABLE public.cb_importacao_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cb_importacao_lote_itens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cb_importacao_lotes, public.cb_importacao_lote_itens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cb_importacao_lotes, public.cb_importacao_lote_itens TO service_role;

-- 1. Abre o lote, antes da primeira gravação da importação.
CREATE OR REPLACE FUNCTION public.cb_importacao_iniciar(
  _clinica_id uuid, _produto text, _convenio_id uuid, _arquivo_nome text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_member(auth.uid(), _clinica_id) THEN
    RAISE EXCEPTION 'Sem permissão para importar nesta clínica.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.cb_importacao_lotes (clinica_id, produto, convenio_id, arquivo_nome, criado_por)
  VALUES (_clinica_id, _produto, _convenio_id, left(coalesce(nullif(trim(_arquivo_nome), ''), 'planilha'), 200), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 2. Anota no lote o que a importação acabou de criar. Só aceita registro da mesma clínica,
--    criado depois de o lote abrir, e só de quem abriu o lote — senão um id qualquer poderia
--    ser anotado e apagado depois pelo desfazer.
CREATE OR REPLACE FUNCTION public.cb_importacao_registrar(
  _lote_id uuid, _tipo text, _ids uuid[]
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lote public.cb_importacao_lotes%ROWTYPE;
  v_pedidos integer;
  v_validos integer;
BEGIN
  SELECT * INTO v_lote FROM public.cb_importacao_lotes WHERE id = _lote_id;
  IF NOT FOUND OR auth.uid() IS NULL OR v_lote.criado_por <> auth.uid() THEN
    RAISE EXCEPTION 'Importação não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF v_lote.status <> 'em_andamento' THEN
    RAISE EXCEPTION 'Esta importação já foi encerrada.';
  END IF;

  SELECT count(DISTINCT x) INTO v_pedidos FROM unnest(coalesce(_ids, '{}'::uuid[])) x;
  IF v_pedidos = 0 THEN
    RETURN 0;
  END IF;

  IF _tipo IN ('titular','dependente') THEN
    SELECT count(*) INTO v_validos FROM public.pacientes p
    WHERE p.id = ANY(_ids) AND p.clinica_id = v_lote.clinica_id AND p.created_at >= v_lote.created_at;
  ELSIF _tipo = 'contrato' THEN
    SELECT count(*) INTO v_validos FROM public.contratos_assinatura c
    WHERE c.id = ANY(_ids) AND c.clinica_id = v_lote.clinica_id AND c.created_at >= v_lote.created_at;
  ELSIF _tipo = 'vinculo' THEN
    SELECT count(*) INTO v_validos FROM public.contrato_dependentes d
    JOIN public.contratos_assinatura c ON c.id = d.contrato_id
    WHERE d.id = ANY(_ids) AND c.clinica_id = v_lote.clinica_id AND d.created_at >= v_lote.created_at;
  ELSE
    RAISE EXCEPTION 'Tipo de registro inválido.';
  END IF;

  IF v_validos <> v_pedidos THEN
    RAISE EXCEPTION 'Registro fora desta importação.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.cb_importacao_lote_itens (lote_id, tipo, registro_id)
  SELECT _lote_id, _tipo, x FROM (SELECT DISTINCT unnest(_ids) AS x) s
  ON CONFLICT DO NOTHING;
  UPDATE public.cb_importacao_lotes SET atualizado_em = now() WHERE id = _lote_id;
  RETURN v_validos;
END;
$$;

-- 3. Fecha o lote no fim da importação.
CREATE OR REPLACE FUNCTION public.cb_importacao_concluir(_lote_id uuid, _pendencias integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.cb_importacao_lotes
     SET status = 'concluido', concluido_em = now(), atualizado_em = now(),
         pendencias = greatest(coalesce(_pendencias, 0), 0)
   WHERE id = _lote_id AND criado_por = auth.uid() AND status = 'em_andamento';
END;
$$;

-- 4. Histórico da tela. `pode_desfazer` diz se quem está vendo é gestor da unidade.
CREATE OR REPLACE FUNCTION public.cb_importacao_listar(_clinica_id uuid, _produto text, _limite integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gestor boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_member(auth.uid(), _clinica_id) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501';
  END IF;
  v_gestor := public.can_manage_clinica(auth.uid(), _clinica_id) OR public.is_platform_admin(auth.uid());

  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC)
    FROM (
      SELECT l.id, l.arquivo_nome, l.status, l.created_at, l.concluido_em, l.revertido_em,
             l.pendencias, l.removidos, cv.nome AS convenio_nome,
             pc.nome AS criado_por_nome, pr.nome AS revertido_por_nome,
             (SELECT count(*) FROM public.cb_importacao_lote_itens i WHERE i.lote_id = l.id AND i.tipo = 'titular') AS titulares,
             (SELECT count(*) FROM public.cb_importacao_lote_itens i WHERE i.lote_id = l.id AND i.tipo = 'dependente') AS dependentes,
             (SELECT count(*) FROM public.cb_importacao_lote_itens i WHERE i.lote_id = l.id AND i.tipo = 'contrato') AS contratos,
             (SELECT count(*) FROM public.cb_importacao_lote_itens i WHERE i.lote_id = l.id AND i.tipo = 'vinculo') AS vinculos,
             v_gestor AS pode_desfazer
      FROM public.cb_importacao_lotes l
      LEFT JOIN public.cb_convenios cv ON cv.id = l.convenio_id
      LEFT JOIN public.profiles pc ON pc.id = l.criado_por
      LEFT JOIN public.profiles pr ON pr.id = l.revertido_por
      WHERE l.clinica_id = _clinica_id AND l.produto = _produto
      ORDER BY l.created_at DESC
      LIMIT least(greatest(coalesce(_limite, 20), 1), 100)
    ) s
  ), '[]'::jsonb);
END;
$$;

-- 5. Desfaz o lote. Com _simular = true (padrão) só confere e diz o que seria apagado.
CREATE OR REPLACE FUNCTION public.cb_importacao_reverter(_lote_id uuid, _simular boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lote public.cb_importacao_lotes%ROWTYPE;
  v_pacientes uuid[];
  v_contratos uuid[];
  v_vinculos uuid[];
  v_titulares integer;
  v_dependentes integer;
  v_bloq jsonb := '[]'::jsonb;
  v_ids uuid[];
  v_lista jsonb;
  v_removidos jsonb;
  r record;
BEGIN
  SELECT * INTO v_lote FROM public.cb_importacao_lotes WHERE id = _lote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Importação não encontrada.';
  END IF;
  IF auth.uid() IS NULL OR NOT (public.can_manage_clinica(auth.uid(), v_lote.clinica_id)
                                OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Só o gestor da unidade pode desfazer uma importação.' USING ERRCODE = '42501';
  END IF;
  IF v_lote.status = 'revertido' THEN
    RAISE EXCEPTION 'Esta importação já foi desfeita.';
  END IF;
  IF v_lote.status = 'em_andamento' AND v_lote.atualizado_em > now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'Esta importação ainda está em andamento. Espere terminar (ou 10 minutos, se ela foi interrompida) para desfazer.';
  END IF;

  -- Só o que ainda existe (alguém pode ter apagado algo à mão).
  SELECT coalesce(array_agg(p.id), '{}'),
         count(*) FILTER (WHERE i.tipo = 'titular'),
         count(*) FILTER (WHERE i.tipo = 'dependente')
    INTO v_pacientes, v_titulares, v_dependentes
    FROM public.cb_importacao_lote_itens i JOIN public.pacientes p ON p.id = i.registro_id
   WHERE i.lote_id = _lote_id AND i.tipo IN ('titular','dependente');
  SELECT coalesce(array_agg(c.id), '{}') INTO v_contratos
    FROM public.cb_importacao_lote_itens i JOIN public.contratos_assinatura c ON c.id = i.registro_id
   WHERE i.lote_id = _lote_id AND i.tipo = 'contrato';
  SELECT coalesce(array_agg(d.id), '{}') INTO v_vinculos
    FROM public.cb_importacao_lote_itens i JOIN public.contrato_dependentes d ON d.id = i.registro_id
   WHERE i.lote_id = _lote_id AND i.tipo = 'vinculo';

  -- Segura os registros enquanto confere (quem tenta ligar algo a eles por chave estrangeira espera).
  PERFORM 1 FROM public.pacientes WHERE id = ANY(v_pacientes) FOR UPDATE;
  PERFORM 1 FROM public.contratos_assinatura WHERE id = ANY(v_contratos) FOR UPDATE;

  -- Pacientes: qualquer coluna *paciente_id (ou unificado_para_id) de qualquer tabela.
  IF cardinality(v_pacientes) > 0 THEN
    FOR r IN
      SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
       WHERE c.table_schema = 'public' AND c.data_type = 'uuid'
         AND (c.column_name LIKE '%paciente_id' OR c.column_name = 'unificado_para_id')
         AND c.table_name NOT IN ('contratos_assinatura','contrato_dependentes')
    LOOP
      EXECUTE format('SELECT array_agg(DISTINCT %1$I) FROM public.%2$I WHERE %1$I = ANY($1)',
                     r.column_name, r.table_name)
        INTO v_ids USING v_pacientes;
      IF v_ids IS NOT NULL THEN
        v_bloq := v_bloq || (SELECT jsonb_agg(jsonb_build_object('id', x, 'tabela', r.table_name)) FROM unnest(v_ids) x);
      END IF;
    END LOOP;

    -- Contrato ou vínculo que não veio desta importação.
    SELECT array_agg(DISTINCT paciente_id) INTO v_ids FROM public.contratos_assinatura
     WHERE paciente_id = ANY(v_pacientes) AND NOT (id = ANY(v_contratos));
    IF v_ids IS NOT NULL THEN
      v_bloq := v_bloq || (SELECT jsonb_agg(jsonb_build_object('id', x, 'tabela', 'outro_contrato')) FROM unnest(v_ids) x);
    END IF;
    SELECT array_agg(DISTINCT paciente_id) INTO v_ids FROM public.contrato_dependentes
     WHERE paciente_id = ANY(v_pacientes) AND NOT (id = ANY(v_vinculos));
    IF v_ids IS NOT NULL THEN
      v_bloq := v_bloq || (SELECT jsonb_agg(jsonb_build_object('id', x, 'tabela', 'outro_contrato')) FROM unnest(v_ids) x);
    END IF;
  END IF;

  -- Contratos: toda tabela com chave estrangeira para contratos_assinatura.
  IF cardinality(v_contratos) > 0 THEN
    FOR r IN
      SELECT con.conrelid::regclass::text AS tabela, a.attname::text AS coluna
        FROM pg_constraint con
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
       WHERE con.contype = 'f' AND con.confrelid = 'public.contratos_assinatura'::regclass
         AND array_length(con.conkey, 1) = 1
         AND con.conrelid <> 'public.contrato_dependentes'::regclass
    LOOP
      EXECUTE format('SELECT array_agg(DISTINCT %1$I) FROM %2$s WHERE %1$I = ANY($1)', r.coluna, r.tabela)
        INTO v_ids USING v_contratos;
      IF v_ids IS NOT NULL THEN
        v_bloq := v_bloq || (SELECT jsonb_agg(jsonb_build_object('id', x, 'tabela', r.tabela)) FROM unnest(v_ids) x);
      END IF;
    END LOOP;

    -- Dependente incluído à mão depois, num contrato criado pela importação.
    SELECT array_agg(DISTINCT contrato_id) INTO v_ids FROM public.contrato_dependentes
     WHERE contrato_id = ANY(v_contratos) AND NOT (id = ANY(v_vinculos));
    IF v_ids IS NOT NULL THEN
      v_bloq := v_bloq || (SELECT jsonb_agg(jsonb_build_object('id', x, 'tabela', 'contrato_dependentes')) FROM unnest(v_ids) x);
    END IF;
  END IF;

  -- Lista legível: nome do paciente (ou do titular do contrato) e onde ele já foi usado.
  SELECT coalesce(jsonb_agg(jsonb_build_object('nome', s.nome, 'onde', s.onde) ORDER BY s.nome), '[]'::jsonb)
    INTO v_lista
    FROM (
      SELECT coalesce(p.nome, ca.paciente_nome, '—') AS nome,
             string_agg(DISTINCT CASE
               WHEN b->>'tabela' IN ('agendamentos','agendamento_confirmacoes','senhas','nina_remarcacoes_pendentes','fisio_marcacoes') THEN 'agenda'
               WHEN b->>'tabela' IN ('fin_lancamentos','fin_atendimentos','pagamentos','boletos','nfse','fin_notas_pacientes') THEN 'financeiro'
               WHEN b->>'tabela' IN ('contrato_mensalidades') THEN 'mensalidades do cartão'
               WHEN b->>'tabela' IN ('prontuarios','triagens_enfermagem','exame_resultados','documentos_emitidos','anamnese_respostas','alertas_enfermagem')
                    OR b->>'tabela' LIKE 'odonto_%' OR b->>'tabela' LIKE 'fisio_%' OR b->>'tabela' LIKE 'paciente_%' THEN 'atendimento / ficha do paciente'
               WHEN b->>'tabela' = 'orcamentos' THEN 'orçamentos'
               WHEN b->>'tabela' IN ('outro_contrato','contrato_dependentes') THEN 'outro cartão / dependente incluído depois'
               ELSE b->>'tabela'
             END, ', ') AS onde
        FROM jsonb_array_elements(v_bloq) b
        LEFT JOIN public.pacientes p ON p.id = (b->>'id')::uuid
        LEFT JOIN public.contratos_assinatura ca ON ca.id = (b->>'id')::uuid
       GROUP BY 1
       LIMIT 100
    ) s;

  v_removidos := jsonb_build_object(
    'titulares', v_titulares, 'dependentes', v_dependentes,
    'contratos', cardinality(v_contratos), 'vinculos', cardinality(v_vinculos));

  IF _simular OR jsonb_array_length(v_lista) > 0 THEN
    RETURN v_removidos || jsonb_build_object(
      'ok', jsonb_array_length(v_lista) = 0, 'simulado', true, 'bloqueios', v_lista);
  END IF;

  DELETE FROM public.contrato_dependentes WHERE id = ANY(v_vinculos);
  DELETE FROM public.contratos_assinatura WHERE id = ANY(v_contratos);
  DELETE FROM public.pacientes WHERE id = ANY(v_pacientes);

  UPDATE public.cb_importacao_lotes
     SET status = 'revertido', revertido_por = auth.uid(), revertido_em = now(),
         atualizado_em = now(), removidos = v_removidos
   WHERE id = _lote_id;

  RETURN v_removidos || jsonb_build_object('ok', true, 'simulado', false, 'bloqueios', '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.cb_importacao_iniciar(uuid, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cb_importacao_registrar(uuid, text, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cb_importacao_concluir(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cb_importacao_listar(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cb_importacao_reverter(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cb_importacao_iniciar(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cb_importacao_registrar(uuid, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cb_importacao_concluir(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cb_importacao_listar(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cb_importacao_reverter(uuid, boolean) TO authenticated;
