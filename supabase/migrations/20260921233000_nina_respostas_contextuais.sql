-- Resposta curta confirma somente a referência da última pergunta entregue.
-- Apenas nova versão das instruções. Sem alteração estrutural, templates de
-- mensagens, cadastro, agenda, financeiro ou conteúdo das versões históricas.
BEGIN;
DO $instrucoes$
DECLARE
  anterior public.nina_instrucoes_versoes;
  troca jsonb;
  novo text;
  proxima integer;
  comentario_novo text := '21/09/2026: reconhecer confirmações informais pelo contexto sem repetir a identificação do médico.';
BEGIN
  LOCK TABLE public.nina_instrucoes_versoes IN SHARE ROW EXCLUSIVE MODE;
  FOR anterior IN SELECT * FROM public.nina_instrucoes_versoes WHERE escopo='whatsapp' AND status='publicada'
  LOOP
    IF EXISTS (SELECT 1 FROM public.nina_instrucoes_versoes v WHERE v.clinica_id IS NOT DISTINCT FROM anterior.clinica_id
      AND v.escopo=anterior.escopo AND v.comentario=comentario_novo) THEN CONTINUE; END IF;
    novo := anterior.conteudo;
    FOR troca IN SELECT value FROM jsonb_array_elements($trocas$[["Interprete respostas curtas, como “sim, por favor”, em relação à última pergunta ou oferta feita. Reaproveite o procedimento, a especialidade e o médico já definidos na conversa, salvo mudança explícita do paciente. Aceitar consultar vagas autoriza essa consulta para o médico definido; não autoriza reservar um horário ainda não escolhido.","Interprete respostas curtas, como “sim, por favor”, em relação à última pergunta ou oferta feita. Reaproveite o procedimento, a especialidade e o médico já definidos na conversa, salvo mudança explícita do paciente. Aceitar consultar vagas autoriza essa consulta para o médico definido; não autoriza reservar um horário ainda não escolhido.\nInterprete a escrita informal do português brasileiro pelo contexto, inclusive abreviações, ausência de acentos, pontuação e alongamentos como “simmm”. “Isso”, “esse mesmo”, “esse”, “sim”, “ss”, “é esse”, “esse msm”, “aham”, “uhum”, “blz” e “fechou” podem expressar concordância com a pergunta anterior; são exemplos, não um vocabulário obrigatório nem características exclusivas de uma região. Não imite gírias por suposição sobre a origem do paciente; mantenha sua linguagem clara e sem emojis.\nSe a última pergunta entregue pediu confirmar UM profissional identificado pelo nome, uma concordância inequívoca confirma esse profissional. Reconsulte o identificador da opção apresentada, preserve a consulta/especialidade já escolhida e prossiga sem pedir novamente o nome nem gastar outra tentativa de esclarecimento. O contexto confirmacao_profissional_na_resposta, quando fornecido, identifica essa referência; ainda exige revalidar o registro publicado. Exemplo: “Você se refere a Sandro Prinscewal?” → “Isso” confirma Sandro. Se o médico atende Cardiologia e Clínico Geral e o paciente já pediu Clínico Geral, mantenha Clínico Geral.\nUma resposta afirmativa a uma lista com mais de uma opção não escolhe automaticamente nenhuma delas. Negativas, dúvidas, condições, correções ou mudança de assunto, como “esse não”, “sim, mas quero outro”, “isso?” e “pode ser se tiver amanhã”, não são aceite incondicional. Pergunte apenas a diferença que ainda falta, respeitando os limites vigentes. Vincule cada resposta à etapa: confirmar o médico não confirma a reserva; aceitar verificar vagas autoriza somente a leitura da agenda; agendar continua exigindo vaga escolhida, dados necessários e aceite do resumo final realmente entregue."]]$trocas$::jsonb)
    LOOP
      IF position(troca->>1 in novo)>0 THEN CONTINUE; END IF;
      IF position(troca->>0 in novo)=0 THEN RAISE EXCEPTION 'Instrução mudou; reconciliar respostas contextuais antes de publicar.'; END IF;
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
