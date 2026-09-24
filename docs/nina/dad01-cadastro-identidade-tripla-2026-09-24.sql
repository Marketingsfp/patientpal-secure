-- Publicação da DAD-01 (cadastro) alinhada a behavior-v4.ts do commit 7deb889eb.
-- Aplicada como alteração de dados em 24/09/2026; idempotente pelo comentário.
DO $instrucoes$
DECLARE
  anterior public.nina_instrucoes_versoes;
  troca jsonb;
  novo text;
  proxima integer;
  comentario_novo text := '24/09/2026: DAD-01 alinhada ao commit 7deb889eb — nome completo, nascimento e telefone em conjunto; cadastro em pacientes do Clínica OS e reserva no mesmo ID; homologação com número virtual e registros de teste.';
BEGIN
  LOCK TABLE public.nina_instrucoes_versoes IN SHARE ROW EXCLUSIVE MODE;
  FOR anterior IN SELECT * FROM public.nina_instrucoes_versoes WHERE escopo='whatsapp' AND status='publicada'
  LOOP
    IF EXISTS (SELECT 1 FROM public.nina_instrucoes_versoes v WHERE v.clinica_id IS NOT DISTINCT FROM anterior.clinica_id
      AND v.escopo=anterior.escopo AND v.comentario=comentario_novo) THEN CONTINUE; END IF;
    novo := anterior.conteudo;
    FOR troca IN SELECT value FROM jsonb_array_elements($tr$[["Um telefone isolado não confirma a identidade. Em caso de homônimos ou divergência cadastral indicada pelo sistema, solicite conferência humana pelo fluxo autorizado; não escolha um registro arbitrariamente nem crie outro para contornar o problema. Não sobrescreva dados já preenchidos sem um fluxo autorizado.", "Cruze nome completo, data de nascimento e telefone do WhatsApp em conjunto usando identificar_paciente. Nomes e nascimentos iguais podem pertencer a pessoas diferentes: o sistema deve distinguir os cadastros pelo telefone, inclusive o telefone secundário cadastrado. Um telefone isolado não confirma a identidade. Se não existir cadastro compatível, crie com o nome completo e nascimento informados e o telefone do WhatsApp da conversa; agende no ID devolvido pela ferramenta. Se houver mais de um cadastro com os três dados iguais ou divergência cadastral indicada pelo sistema, solicite conferência humana pelo fluxo autorizado; não escolha um registro arbitrariamente nem crie outro para contornar o problema. Não sobrescreva dados já preenchidos sem um fluxo autorizado."], ["Em homologação, use exclusivamente os cadastros e efeitos de teste disponibilizados, sem criar ou alterar pacientes reais.", "Em homologação, execute a mesma busca e criação com o nome completo e nascimento informados e o número virtual da conversa como telefone. Os cadastros e agendamentos são marcados como teste pelo sistema e não podem reutilizar ou alterar pacientes de produção."]]$tr$::jsonb)
    LOOP
      IF position(troca->>1 in novo)>0 THEN CONTINUE; END IF;
      IF position(troca->>0 in novo)=0 THEN RAISE EXCEPTION 'DAD-01 mudou; reconciliar antes de publicar.'; END IF;
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
