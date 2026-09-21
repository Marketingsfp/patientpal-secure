-- Escolha de médico: repetir a lista uma vez sem perder a consulta identificada.
-- Apenas nova versão das instruções. Sem alteração estrutural, templates de
-- mensagens, cadastro, agenda, financeiro ou conteúdo das versões históricas.
BEGIN;
DO $instrucoes$
DECLARE
  anterior public.nina_instrucoes_versoes;
  troca jsonb;
  novo text;
  proxima integer;
  comentario_novo text := '21/09/2026: corrigir escolha do médico uma vez e encaminhar com motivo específico se persistir.';
BEGIN
  LOCK TABLE public.nina_instrucoes_versoes IN SHARE ROW EXCLUSIVE MODE;
  FOR anterior IN SELECT * FROM public.nina_instrucoes_versoes WHERE escopo='whatsapp' AND status='publicada'
  LOOP
    IF EXISTS (SELECT 1 FROM public.nina_instrucoes_versoes v WHERE v.clinica_id IS NOT DISTINCT FROM anterior.clinica_id
      AND v.escopo=anterior.escopo AND v.comentario=comentario_novo) THEN CONTINUE; END IF;
    novo := anterior.conteudo;
    FOR troca IN SELECT value FROM jsonb_array_elements($trocas$[["Para identificar um atendimento ou profissional ambíguo, peça esclarecimento ATÉ DUAS VEZES por solicitação. Reaproveite as respostas e a contagem registradas na sessão. Se a primeira resposta não resolver, faça uma segunda pergunta mais específica, usando o que o paciente já informou e as opções atuais da base. Não repita a mesma pergunta. Se compreender após qualquer resposta, prossiga imediatamente, sem gastar a pergunta restante. Encaminhe para a equipe humana somente se a identificação continuar inconclusiva após a resposta à segunda pergunta, registrando internamente o pedido, as perguntas feitas e a dúvida restante. Esse limite não se aplica às perguntas necessárias para escolher data/horário, completar cadastro ou confirmar a reserva; uma nova solicitação independente começa com sua própria contagem.","Para identificar um atendimento ou profissional ambíguo, peça esclarecimento ATÉ DUAS VEZES por solicitação. Reaproveite as respostas e a contagem registradas na sessão. Se a primeira resposta não resolver, faça uma segunda pergunta mais específica, usando o que o paciente já informou e as opções atuais da base. Não repita a mesma pergunta. Se compreender após qualquer resposta, prossiga imediatamente, sem gastar a pergunta restante. Encaminhe para a equipe humana somente se a identificação continuar inconclusiva após a resposta à segunda pergunta, registrando internamente o pedido, as perguntas feitas e a dúvida restante. Esse limite não se aplica às perguntas necessárias para escolher data/horário, completar cadastro ou confirmar a reserva; uma nova solicitação independente começa com sua própria contagem. Exceção para a escolha de médico de uma consulta já encontrada: mantenha a consulta identificada no termo da pesquisa e envie o nome informado pelo paciente no filtro medico. Se esse nome não corresponder aos profissionais publicados, diga que não encontrou esse nome entre os médicos daquela consulta, reapresente os nomes disponíveis e peça UMA VEZ para escolher novamente. Para nomes parecidos ou homônimos, diga que não conseguiu identificar com segurança, sem afirmar que o médico não existe. Se a resposta a essa nova pergunta ainda não identificar o profissional, encaminhe à equipe; não abra outra rodada de esclarecimento. Se identificar, continue normalmente. Registre internamente que a consulta foi encontrada e a dificuldade está na identificação do médico, incluindo consulta, nome informado e opções apresentadas; nunca use o motivo de consulta ou procedimento não encontrado nesse caso. Não escolha outro médico por conta própria. Uma mudança explícita de consulta inicia uma solicitação independente."]]$trocas$::jsonb)
    LOOP
      IF position(troca->>1 in novo)>0 THEN CONTINUE; END IF;
      IF position(troca->>0 in novo)=0 THEN RAISE EXCEPTION 'Instrução mudou; reconciliar a escolha do médico antes de publicar.'; END IF;
      novo := replace(novo,troca->>0,troca->>1);
    END LOOP;
    IF novo=anterior.conteudo THEN CONTINUE; END IF;
    IF length(novo)>60000 THEN RAISE EXCEPTION 'Prompt ultrapassa limite de publicação.'; END IF;
    SELECT coalesce(max(v.versao),0)+1 INTO proxima FROM public.nina_instrucoes_versoes v
      WHERE v.clinica_id IS NOT DISTINCT FROM anterior.clinica_id AND v.escopo=anterior.escopo;
    UPDATE public.nina_instrucoes_versoes SET status='arquivada' WHERE id=anterior.id;
    INSERT INTO public.nina_instrucoes_versoes(clinica_id,escopo,versao,conteudo,status,comentario,versao_anterior_id,publicado_em)
      VALUES(anterior.clinica_id,anterior.escopo,proxima,novo,'publicada',comentario_novo,anterior.id,now());
  END LOOP;
END;
$instrucoes$;
COMMIT;
