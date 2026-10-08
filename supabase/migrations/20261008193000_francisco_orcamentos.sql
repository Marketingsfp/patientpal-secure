-- Francisco: somente novas tabelas e leituras de orçamento/financeiro.
-- Nenhum orçamento, recebimento ou cadastro de paciente é alterado.
BEGIN;
CREATE TABLE public.francisco_config (
  clinica_id uuid PRIMARY KEY REFERENCES public.clinicas(id),
  rascunho jsonb NOT NULL, publicado jsonb,
  revisao integer NOT NULL DEFAULT 1,
  inicio_campanha timestamptz, cursor_job jsonb, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.francisco_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid NOT NULL REFERENCES public.clinicas(id),
  tipo text NOT NULL, ator uuid, dados jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.francisco_eventos(clinica_id, created_at DESC, id);
CREATE UNIQUE INDEX francisco_resposta_idempotente ON public.francisco_eventos(clinica_id, (dados->>'wa_message_id'))
  WHERE tipo IN ('saida_solicitada','resposta_encaminhada');
CREATE TABLE public.francisco_contatos (
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id), telefone text NOT NULL CHECK (telefone ~ '^55[1-9][0-9]{10}$'),
  estado text NOT NULL CHECK (estado IN ('autorizado','recusado','respondido')),
  evidencia text NOT NULL, atualizado_por uuid, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(clinica_id, telefone)
);
CREATE TABLE public.francisco_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid NOT NULL REFERENCES public.clinicas(id),
  orcamento_id uuid NOT NULL REFERENCES public.orcamentos(id), telefone text NOT NULL,
  etapa text NOT NULL CHECK(etapa IN ('d1','d4')),
  status text NOT NULL DEFAULT 'reservado' CHECK(status IN ('reservado','enviado','incerto','bloqueado')),
  motivo text, template_nome text NOT NULL, texto text NOT NULL, configuracao jsonb NOT NULL,
  wa_message_id text UNIQUE, entrega text, respondido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(orcamento_id, etapa)
);
CREATE INDEX ON public.francisco_envios(clinica_id, telefone, created_at DESC);
CREATE INDEX ON public.francisco_envios(clinica_id, created_at DESC, id);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['francisco_config','francisco_eventos','francisco_contatos','francisco_envios'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY francisco_leitura ON public.%I FOR SELECT TO authenticated USING (
      public.has_module_access(auth.uid(), clinica_id, ''francisco'', ''read'') AND EXISTS (
        SELECT 1 FROM public.clinica_memberships m WHERE m.clinica_id = %I.clinica_id AND m.user_id = auth.uid() AND m.ativo))', t, t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Uma transação para CAS da configuração + histórico. Apenas servidor autorizado.
CREATE FUNCTION public.francisco_salvar_config(p_clinica uuid, p_ator uuid, p_revisao integer, p_config jsonb, p_publicar boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.francisco_config; BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('francisco-config:' || p_clinica::text, 0));
  SELECT * INTO c FROM public.francisco_config WHERE clinica_id = p_clinica FOR UPDATE;
  IF coalesce(c.revisao, 0) <> p_revisao THEN RAISE EXCEPTION 'Configuração alterada por outra pessoa. Recarregue antes de salvar.'; END IF;
  INSERT INTO public.francisco_config(clinica_id, rascunho, publicado, revisao, inicio_campanha)
    VALUES(p_clinica, p_config, CASE WHEN p_publicar THEN p_config END, 1, CASE WHEN p_publicar THEN now() END)
  ON CONFLICT(clinica_id) DO UPDATE SET rascunho = p_config,
    publicado = CASE WHEN p_publicar THEN p_config ELSE francisco_config.publicado END,
    revisao = francisco_config.revisao + 1,
    inicio_campanha = CASE WHEN p_publicar THEN coalesce(francisco_config.inicio_campanha, now()) ELSE francisco_config.inicio_campanha END,
    updated_at = now() RETURNING * INTO c;
  INSERT INTO public.francisco_eventos(clinica_id,tipo,ator,dados) VALUES(p_clinica,
    CASE WHEN p_publicar THEN 'configuracao_publicada' ELSE 'rascunho_salvo' END,p_ator,
    jsonb_build_object('revisao',c.revisao,'configuracao',p_config,'inicio_campanha',c.inicio_campanha));
  RETURN to_jsonb(c);
END $$;

CREATE FUNCTION public.francisco_autorizar_contato(p_clinica uuid, p_ator uuid, p_telefone text, p_estado text, p_evidencia text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
  IF p_estado NOT IN ('autorizado','recusado') OR length(trim(p_evidencia)) < 10 THEN RAISE EXCEPTION 'Informe a autorização e sua evidência.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('francisco:'||p_clinica::text||':'||p_telefone,0));
  INSERT INTO public.francisco_contatos(clinica_id,telefone,estado,evidencia,atualizado_por)
    VALUES(p_clinica,p_telefone,p_estado,p_evidencia,p_ator)
  ON CONFLICT(clinica_id,telefone) DO UPDATE SET estado=p_estado,evidencia=p_evidencia,atualizado_por=p_ator,updated_at=now();
  INSERT INTO public.francisco_eventos(clinica_id,tipo,ator,dados)
    VALUES(p_clinica,'autorizacao_contato',p_ator,jsonb_build_object('telefone',p_telefone,'estado',p_estado,'evidencia',p_evidencia));
END $$;

-- Uma agenda criada NÃO é pagamento. Há quatro caminhos financeiros:
-- item (inclusive sinal), atendimento financeiro, agenda do orçamento e ponte item-agenda.
CREATE FUNCTION public.francisco_avaliar(p_clinica uuid, p_orcamento uuid, p_config jsonb, p_inicio timestamptz, p_agora timestamptz DEFAULT now(), p_reserva uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orcamentos; tel text; v_etapa text; motivo text; idade interval; BEGIN
  SELECT * INTO o FROM public.orcamentos WHERE id=p_orcamento AND clinica_id=p_clinica;
  IF o.id IS NULL THEN RETURN jsonb_build_object('motivo','orcamento_inexistente'); END IF;
  tel := regexp_replace(coalesce(o.paciente_telefone,''),'[^0-9]','','g');
  IF length(tel)=11 THEN tel := '55'||tel; END IF;
  -- Canonicaliza celular brasileiro recebido pela Meta sem o nono dígito.
  IF length(tel)=12 AND left(tel,2)='55' AND substring(tel,5,1) IN ('6','7','8','9') THEN tel:=left(tel,4)||'9'||substring(tel,5); END IF;
  idade := p_agora-o.created_at;
  v_etapa := CASE WHEN idade >= interval '96 hours' THEN 'd4' ELSE 'd1' END;
  IF p_inicio IS NULL OR o.created_at < p_inicio THEN motivo:='anterior_ao_inicio';
  ELSIF o.status <> 'aberto' THEN motivo:='orcamento_encerrado_ou_status_desconhecido';
  ELSIF o.valor_total <= 0 THEN motivo:='sem_valor';
  ELSIF o.created_at + make_interval(days=>o.validade_dias) <= p_agora THEN motivo:='orcamento_vencido';
  ELSIF tel !~ '^55[1-9][1-9]9[0-9]{8}$' THEN motivo:='telefone_invalido';
  ELSIF NOT EXISTS(SELECT 1 FROM public.orcamento_itens i WHERE i.orcamento_id=o.id) THEN motivo:='sem_itens';
  ELSIF EXISTS(SELECT 1 FROM public.orcamento_itens i WHERE i.orcamento_id=o.id AND (
    i.status_financeiro <> 'pendente' OR i.valor_pago > 0 OR i.pago_em IS NOT NULL OR i.sinal_pago_em IS NOT NULL OR i.saldo_pago_em IS NOT NULL
    OR i.status_operacional IN ('cancelado','nao_aplicavel'))) THEN motivo:='item_pago_parcial_ou_inaplicavel';
  ELSIF EXISTS(SELECT 1 FROM public.fin_atendimentos f JOIN public.orcamento_itens i ON i.id=f.orcamento_item_id
    WHERE i.orcamento_id=o.id AND f.clinica_id=p_clinica AND f.status='realizado')
    OR EXISTS(SELECT 1 FROM public.orcamento_itens i JOIN public.fin_atendimentos f ON f.id=i.fin_atendimento_id
      WHERE i.orcamento_id=o.id AND f.clinica_id=p_clinica AND f.status='realizado')
    THEN motivo:='recebimento_registrado';
  ELSIF EXISTS(SELECT 1 FROM public.fin_lancamentos f WHERE f.clinica_id=p_clinica AND f.tipo='receita' AND f.status='confirmado' AND (
    f.agendamento_id IN (SELECT a.id FROM public.agendamentos a WHERE a.clinica_id=p_clinica AND a.orcamento_id=o.id)
    OR f.agendamento_id IN (SELECT a.agendamento_id FROM public.agendamento_orcamento_itens a WHERE a.clinica_id=p_clinica AND a.orcamento_id=o.id)
    OR f.agendamento_id IN (SELECT i.agendamento_id FROM public.orcamento_itens i WHERE i.orcamento_id=o.id)
    OR f.id IN (SELECT a.lancamento_id FROM public.fin_atendimentos a JOIN public.orcamento_itens i ON i.id=a.orcamento_item_id WHERE i.orcamento_id=o.id AND a.clinica_id=p_clinica)
    OR f.id IN (SELECT a.lancamento_id FROM public.fin_atendimentos a JOIN public.orcamento_itens i ON i.fin_atendimento_id=a.id WHERE i.orcamento_id=o.id AND a.clinica_id=p_clinica)
  )) THEN motivo:='recebimento_confirmado';
  ELSIF EXISTS(SELECT 1 FROM public.francisco_envios e WHERE e.orcamento_id=o.id AND e.respondido_em IS NOT NULL) THEN motivo:='resposta_recebida';
  ELSIF NOT EXISTS(SELECT 1 FROM public.francisco_contatos c WHERE c.clinica_id=p_clinica AND c.telefone=tel AND c.estado='autorizado') THEN motivo:='sem_autorizacao';
  ELSIF EXISTS(SELECT 1 FROM public.atend_conversas v WHERE v.clinica_id=p_clinica
    AND regexp_replace(coalesce(v.contato_telefone,''),'[^0-9]','','g') IN (tel,left(tel,4)||substring(tel,6))
    AND v.status NOT IN ('closed','finished','resolved','resolvida','fechada','encerrada')
    AND (v.owner_type IN ('HUMAN','NONE') OR v.janela_24h_em > p_agora-interval '24 hours')) THEN motivo:='atendimento_em_andamento';
  ELSIF idade < interval '24 hours' THEN motivo:='aguardando_24h';
  ELSIF idade >= interval '168 hours' THEN motivo:='cadencia_expirada';
  ELSIF NOT coalesce((p_config->>v_etapa)::boolean,false) THEN motivo:='etapa_desativada';
  ELSIF EXISTS(SELECT 1 FROM public.francisco_envios e WHERE e.orcamento_id=o.id AND e.etapa=v_etapa AND (p_reserva IS NULL OR e.id<>p_reserva)) THEN motivo:='etapa_ja_reservada';
  ELSIF v_etapa='d4' AND coalesce((p_config->>'d1')::boolean,true) AND NOT EXISTS(
    SELECT 1 FROM public.francisco_envios e WHERE e.orcamento_id=o.id AND e.etapa='d1' AND e.status='enviado' AND coalesce(e.entrega,'sent') <> 'failed'
  ) THEN motivo:='d1_nao_enviado';
  ELSIF EXISTS(SELECT 1 FROM public.francisco_envios e WHERE e.clinica_id=p_clinica AND e.telefone=tel
    AND e.created_at > p_agora-interval '24 hours' AND e.status IN ('reservado','enviado','incerto') AND (p_reserva IS NULL OR e.id<>p_reserva)) THEN motivo:='limite_por_telefone';
  ELSE motivo:='elegivel'; END IF;
  RETURN jsonb_build_object('orcamento_id',o.id,'numero',o.numero,'telefone',tel,'created_at',o.created_at,'etapa',v_etapa,'motivo',motivo);
END $$;

CREATE FUNCTION public.francisco_conferir_reserva(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.francisco_envios; c public.francisco_config; a jsonb; BEGIN
  SELECT * INTO e FROM public.francisco_envios WHERE id=p_id;
  IF e.id IS NULL OR e.status<>'reservado' THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('francisco:'||e.clinica_id::text||':'||e.telefone,0));
  SELECT * INTO e FROM public.francisco_envios WHERE id=p_id FOR UPDATE;
  IF e.status<>'reservado' THEN RETURN false; END IF;
  SELECT * INTO c FROM public.francisco_config WHERE clinica_id=e.clinica_id FOR SHARE;
  a:=public.francisco_avaliar(e.clinica_id,e.orcamento_id,c.publicado,c.inicio_campanha,now(),e.id);
  IF c.publicado IS DISTINCT FROM e.configuracao OR NOT coalesce((c.publicado->>'ativo')::boolean,false)
    OR c.publicado->>'modo'<>'real' OR a->>'motivo'<>'elegivel' OR a->>'etapa'<>e.etapa THEN
    UPDATE public.francisco_envios SET status='bloqueado',motivo='Conferência final: '||coalesce(a->>'motivo','configuracao_alterada'),updated_at=now() WHERE id=e.id;
    RETURN false;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.francisco_conferir_reserva(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.francisco_conferir_reserva(uuid) TO service_role;

CREATE FUNCTION public.francisco_listar_candidatos(p_clinica uuid,p_config jsonb,p_inicio timestamptz,p_cursor_em timestamptz DEFAULT NULL,p_cursor_id uuid DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.francisco_avaliar(p_clinica,o.id,p_config,p_inicio) FROM public.orcamentos o
  WHERE o.clinica_id=p_clinica AND o.created_at >= greatest(coalesce(p_inicio,now()),now()-interval '7 days')
    AND (p_cursor_em IS NULL OR (o.created_at,o.id) > (p_cursor_em,p_cursor_id))
  ORDER BY o.created_at,o.id LIMIT 21;
$$;
REVOKE ALL ON FUNCTION public.francisco_listar_candidatos(uuid,jsonb,timestamptz,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.francisco_listar_candidatos(uuid,jsonb,timestamptz,timestamptz,uuid) TO service_role;

CREATE FUNCTION public.francisco_reservar(p_clinica uuid,p_orcamento uuid,p_etapa text,p_texto text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.francisco_config; a jsonb; e public.francisco_envios; BEGIN
  SELECT * INTO c FROM public.francisco_config WHERE clinica_id=p_clinica FOR SHARE;
  IF NOT coalesce((c.publicado->>'ativo')::boolean,false) OR c.publicado->>'modo' <> 'real' THEN RETURN NULL; END IF;
  a:=public.francisco_avaliar(p_clinica,p_orcamento,c.publicado,c.inicio_campanha);
  PERFORM pg_advisory_xact_lock(hashtextextended('francisco:'||p_clinica::text||':'||(a->>'telefone'),0));
  a:=public.francisco_avaliar(p_clinica,p_orcamento,c.publicado,c.inicio_campanha);
  IF a->>'motivo' <> 'elegivel' OR a->>'etapa' <> p_etapa THEN RETURN NULL; END IF;
  INSERT INTO public.francisco_envios(clinica_id,orcamento_id,telefone,etapa,template_nome,texto,configuracao)
    VALUES(p_clinica,p_orcamento,a->>'telefone',p_etapa,c.publicado->'templates'->p_etapa->>'nome',p_texto,c.publicado)
    ON CONFLICT(orcamento_id,etapa) DO NOTHING RETURNING * INTO e;
  RETURN CASE WHEN e.id IS NOT NULL THEN to_jsonb(e) END;
END $$;

CREATE FUNCTION public.francisco_registrar_resposta(p_clinica uuid,p_telefone text,p_saida boolean,p_mensagem text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('francisco:'||p_clinica::text||':'||p_telefone,0));
  UPDATE public.francisco_contatos SET estado=CASE WHEN p_saida THEN 'recusado' ELSE 'respondido' END,updated_at=now()
    WHERE clinica_id=p_clinica AND telefone=p_telefone;
  UPDATE public.francisco_envios SET respondido_em=coalesce(respondido_em,now()),updated_at=now()
    WHERE clinica_id=p_clinica AND telefone=p_telefone AND respondido_em IS NULL;
  INSERT INTO public.francisco_eventos(clinica_id,tipo,dados) VALUES(p_clinica,
    CASE WHEN p_saida THEN 'saida_solicitada' ELSE 'resposta_encaminhada' END,
    jsonb_build_object('telefone',p_telefone,'wa_message_id',p_mensagem)) ON CONFLICT DO NOTHING;
END $$;

-- Não há RPC de escrita disponível ao navegador, mesmo conhecendo sua assinatura.
REVOKE ALL ON FUNCTION public.francisco_salvar_config(uuid,uuid,integer,jsonb,boolean),
  public.francisco_autorizar_contato(uuid,uuid,text,text,text),
  public.francisco_avaliar(uuid,uuid,jsonb,timestamptz,timestamptz,uuid),
  public.francisco_reservar(uuid,uuid,text,text),public.francisco_registrar_resposta(uuid,text,boolean,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.francisco_salvar_config(uuid,uuid,integer,jsonb,boolean),
  public.francisco_autorizar_contato(uuid,uuid,text,text,text),
  public.francisco_avaliar(uuid,uuid,jsonb,timestamptz,timestamptz,uuid),
  public.francisco_reservar(uuid,uuid,text,text),public.francisco_registrar_resposta(uuid,text,boolean,text)
  TO service_role;
INSERT INTO public.sistema_job_tokens(nome,token) VALUES('francisco-orcamentos',replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','')) ON CONFLICT(nome) DO NOTHING;
COMMIT;
-- O agendamento é ativado separadamente, depois da implantação e homologação.
-- Veja docs/francisco-orcamentos.md. Este arquivo sozinho não dispara mensagens.
