-- Gerada por scripts/nina/gerar-limite-esclarecimento.ts.
-- Publica a nova regra junto do código que persiste e respeita o limite.
-- Preserva conteúdo/autoria/datas das versões anteriores e o painel interno.
DO $nina_duas_perguntas$
DECLARE
  anterior public.nina_instrucoes_versoes;
  alteracao jsonb;
  novo text;
  proxima integer;
  comentario_publicacao text := 'Regra autorizada 21/09/2026: até duas perguntas de identificação por solicitação, com continuidade imediata ao esclarecer.';
BEGIN
  LOCK TABLE public.nina_instrucoes_versoes IN SHARE ROW EXCLUSIVE MODE;
  FOR anterior IN SELECT * FROM public.nina_instrucoes_versoes WHERE escopo = 'whatsapp' AND status = 'publicada'
  LOOP
    IF EXISTS (SELECT 1 FROM public.nina_instrucoes_versoes v
      WHERE v.clinica_id IS NOT DISTINCT FROM anterior.clinica_id AND v.escopo = anterior.escopo
        AND v.comentario = comentario_publicacao) THEN CONTINUE; END IF;
    novo := anterior.conteudo;
    FOR alteracao IN SELECT value FROM jsonb_array_elements($alteracoes$[["Para identificar um atendimento ou profissional ambíguo, peça esclarecimento UMA ÚNICA VEZ por solicitação. Reaproveite o esclarecimento já registrado na sessão. Se a resposta do paciente ainda não permitir identificar o atendimento ou o profissional, encaminhe para a equipe humana, registrando internamente o pedido, a pergunta feita e a dúvida restante. Não repita a pergunta nem abra novas rodadas de tentativa. Esse limite não se aplica às perguntas necessárias para escolher data/horário, completar cadastro ou confirmar a reserva; uma nova solicitação independente tem seu próprio esclarecimento.","Para identificar um atendimento ou profissional ambíguo, peça esclarecimento ATÉ DUAS VEZES por solicitação. Reaproveite as respostas e a contagem registradas na sessão. Se a primeira resposta não resolver, faça uma segunda pergunta mais específica, usando o que o paciente já informou e as opções atuais da base. Não repita a mesma pergunta. Se compreender após qualquer resposta, prossiga imediatamente, sem gastar a pergunta restante. Encaminhe para a equipe humana somente se a identificação continuar inconclusiva após a resposta à segunda pergunta, registrando internamente o pedido, as perguntas feitas e a dúvida restante. Esse limite não se aplica às perguntas necessárias para escolher data/horário, completar cadastro ou confirmar a reserva; uma nova solicitação independente começa com sua própria contagem."],["uma tentativa de esclarecimento quando necessária e encaminhamento se a identificação continuar inconclusiva.","até duas perguntas de esclarecimento quando necessárias; continuidade imediata ao identificar e encaminhamento se a dúvida persistir após a segunda resposta."],["siga o limite de uma tentativa da CONV-04.","siga o limite de duas perguntas por solicitação da CONV-04."]]$alteracoes$::jsonb)
    LOOP
      IF position(alteracao->>1 in novo) > 0 AND position(alteracao->>0 in novo) = 0 THEN CONTINUE; END IF;
      IF cardinality(string_to_array(novo, alteracao->>0)) <> 2 THEN
        RAISE EXCEPTION 'Instruções de esclarecimento divergiram da versão auditada. Reconciliar antes de publicar.';
      END IF;
      novo := replace(novo, alteracao->>0, alteracao->>1);
    END LOOP;
    IF novo = anterior.conteudo THEN CONTINUE; END IF;
    IF length(novo) > 60000 THEN RAISE EXCEPTION 'Prompt ultrapassa o limite de publicação.'; END IF;
    SELECT coalesce(max(v.versao), 0) + 1 INTO proxima FROM public.nina_instrucoes_versoes v
      WHERE v.clinica_id IS NOT DISTINCT FROM anterior.clinica_id AND v.escopo = anterior.escopo;
    UPDATE public.nina_instrucoes_versoes SET status = 'arquivada' WHERE id = anterior.id;
    INSERT INTO public.nina_instrucoes_versoes
      (clinica_id, escopo, versao, conteudo, status, comentario, versao_anterior_id, publicado_em)
    VALUES (anterior.clinica_id, anterior.escopo, proxima, novo, 'publicada', comentario_publicacao, anterior.id, now());
  END LOOP;
END;
$nina_duas_perguntas$;
