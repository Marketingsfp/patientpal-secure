-- Ordem autorizada: escolha da vaga -> dados -> confirmação final -> reserva.
-- Apenas nova versão das instruções. Sem alteração estrutural, templates de
-- mensagens, cadastro, agenda, financeiro ou conteúdo das versões históricas.
BEGIN;
DO $instrucoes$
DECLARE
  anterior public.nina_instrucoes_versoes;
  troca jsonb;
  novo text;
  proxima integer;
  comentario_novo text := '21/09/2026: coleta dos dados após escolher a vaga e antes da confirmação final.';
BEGIN
  LOCK TABLE public.nina_instrucoes_versoes IN SHARE ROW EXCLUSIVE MODE;
  FOR anterior IN SELECT * FROM public.nina_instrucoes_versoes WHERE escopo='whatsapp' AND status='publicada'
  LOOP
    IF EXISTS (SELECT 1 FROM public.nina_instrucoes_versoes v WHERE v.clinica_id IS NOT DISTINCT FROM anterior.clinica_id
      AND v.escopo=anterior.escopo AND v.comentario=comentario_novo) THEN CONTINUE; END IF;
    novo := anterior.conteudo;
    FOR troca IN SELECT value FROM jsonb_array_elements($trocas$[["Conduta: primeiro defina procedimento ou especialidade, médico, data e horário com disponibilidade real consultada; obtenha a confirmação do paciente para a opção escolhida. Só depois consulte o cadastro por consultar_cadastro_paciente, quando a ferramenta estiver disponível, e siga os campos faltantes retornados pelo sistema. Interesse em consultar vagas, como “sim, por favor” após uma oferta de consulta, não é confirmação de um horário.","Conduta: primeiro defina procedimento ou especialidade, médico, data e horário com disponibilidade real consultada e obtenha a escolha da vaga pelo paciente. Depois consulte o cadastro por consultar_cadastro_paciente, quando a ferramenta estiver disponível, e siga os campos faltantes retornados pelo sistema. Complete os dados antes de apresentar o resumo e pedir a confirmação final do agendamento. Interesse em consultar vagas, como “sim, por favor” após uma oferta de consulta, não é confirmação de um horário."],["Após resolver o cadastro, revalide a disponibilidade e execute o agendamento autorizado. Somente informe que está agendado após confirmação do sistema. Em homologação, use exclusivamente os cadastros e efeitos de teste disponibilizados, sem criar ou alterar pacientes reais.","Após resolver o cadastro, apresente o resumo final da vaga e aguarde a confirmação do paciente em uma nova mensagem. Só depois revalide a disponibilidade e execute o agendamento autorizado. Somente informe que está agendado após confirmação do sistema. Em homologação, use exclusivamente os cadastros e efeitos de teste disponibilizados, sem criar ou alterar pacientes reais."],["Resultado esperado: cadastro verificado após a definição e confirmação da vaga, coleta apenas dos dados obrigatórios faltantes e acesso individual autorizado. Perguntas gerais sobre preço, preparo, profissionais ou funcionamento não exigem cadastro.","Resultado esperado: escolha da vaga, cadastro verificado, confirmação final e gravação nessa ordem, com coleta apenas dos dados obrigatórios faltantes e acesso individual autorizado. Perguntas gerais sobre preço, preparo, profissionais ou funcionamento não exigem cadastro."],["Analise a mensagem e o histórico da sessão → identifique categoria, atendimento e objetivos → consulte a base com termo conciso → esclareça uma vez se necessário → responda aos objetivos com fatos confirmados → siga a escolha de profissional/data aplicável → consulte a agenda quando solicitado → apresente opções reais → obtenha escolha e confirmação do resumo final → complete somente o cadastro necessário → execute e informe o resultado confirmado.","Analise a mensagem e o histórico da sessão → identifique categoria, atendimento e objetivos → consulte a base com termo conciso → esclareça uma vez se necessário → responda aos objetivos com fatos confirmados → siga a escolha de profissional/data aplicável → consulte a agenda quando solicitado → apresente opções reais → obtenha a escolha da vaga → complete somente o cadastro necessário → apresente o resumo final e obtenha a confirmação → execute e informe o resultado confirmado."],["- Aceitar consultar vagas não escolhe um horário e não confirma uma reserva. Depois da escolha da vaga, apresente o resumo final com médico, atendimento, data, horário e modalidade corretos. O aceite desse resumo autoriza somente essa opção, mantendo as regras de cadastro e gravação. Sem vaga, siga HUM-04; sem registro no catálogo, siga FAT-04. Nunca substitua silenciosamente médico, dia ou horário.","- Aceitar consultar vagas não escolhe um horário e não confirma uma reserva. Depois da escolha da vaga, confira o cadastro e colete somente os dados faltantes. Só depois apresente o resumo final com médico, atendimento, data, horário e modalidade corretos e aguarde a confirmação. O aceite desse resumo autoriza somente essa opção, mantendo as regras de cadastro e gravação. Sem vaga, siga HUM-04; sem registro no catálogo, siga FAT-04. Nunca substitua silenciosamente médico, dia ou horário."]]$trocas$::jsonb)
    LOOP
      IF position(troca->>1 in novo)>0 THEN CONTINUE; END IF;
      IF position(troca->>0 in novo)=0 THEN RAISE EXCEPTION 'Instrução mudou; reconciliar a ordem do agendamento antes de publicar.'; END IF;
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
