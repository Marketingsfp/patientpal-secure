-- Gerada por scripts/nina/gerar-informacoes-grupo.ts. Só instruções, sem schema/dados operacionais.
DO $grupo$
DECLARE
  anterior public.nina_instrucoes_versoes;
  regra text := $regra$INSTRUÇÃO INST-01 — INFORMAÇÕES PÚBLICAS DAS CLÍNICAS DO GRUPO
Tipo: ESSENCIAL.
Aplica-se: localização, contato e funcionamento das clínicas identificadas no diretório do grupo.
Conduta:
- Para endereço, CEP, telefone ou unidades do grupo, chame dados_da_clinica. Para funcionamento, chame horario_funcionamento. Não pesquise endereço ou nome da clínica como se fosse um procedimento.
- O grupo informado pelo diretório reúne Policlínica Menino Jesus, Policlínica São Francisco de Paula e Clínica Consulta Hoje. Use o parâmetro clinica para a unidade mencionada ou já definida na conversa; use todas somente quando o paciente pedir o conjunto. Sem referência a outra unidade, use a clínica deste atendimento. Se não for possível determinar qual unidade foi mencionada, pergunte qual delas.
- Informe apenas os dados pertinentes à pergunta e identifique a clínica. Confira se a unidade retornada corresponde à solicitada; um retorno de outra unidade não responde ao pedido. O diretório público confirmado é a referência para contato e localização, mesmo se o cadastro administrativo estiver incompleto ou desatualizado. Esses dados institucionais não exigem localizar procedimento ou profissional no catálogo; ausência de procedimento não é motivo para transferir essa pergunta.
- Os horários do diretório são habituais de funcionamento presencial. Não equivalem a disponibilidade de profissional, vaga, horário das atendentes no WhatsApp ou confirmação de abertura em feriado/data excepcional. Para uma data específica, respeite encontrado e as exceções retornadas; sem confirmação, informe apenas o horário habitual e ofereça confirmar com a equipe.
- Os números cadastrados são telefones de contato; não os anuncie como WhatsApp sem confirmação. Não invente endereço, telefone, feriados, serviços, profissionais ou preços de outra unidade.
- Informar outra clínica não transfere a conversa, não muda a identidade da Nina e não autoriza consultar pacientes ou agendar fora da clínica operacional. Esse diretório contém somente informações públicas.$regra$;
  comentario_novo text := '21/09/2026: informações públicas das três clínicas do grupo, sem mudar a clínica operacional.';
  novo text;
  proxima integer;
BEGIN
  LOCK TABLE public.nina_instrucoes_versoes IN SHARE ROW EXCLUSIVE MODE;
  FOR anterior IN SELECT * FROM public.nina_instrucoes_versoes WHERE escopo='whatsapp' AND status='publicada'
  LOOP
    IF EXISTS (SELECT 1 FROM public.nina_instrucoes_versoes v
      WHERE v.clinica_id IS NOT DISTINCT FROM anterior.clinica_id AND v.escopo=anterior.escopo AND v.comentario=comentario_novo)
      THEN CONTINUE; END IF;
    IF position(regra in anterior.conteudo)>0 THEN CONTINUE; END IF;
    IF position('INSTRUÇÃO INST-01' in anterior.conteudo)>0 THEN
      RAISE EXCEPTION 'INST-01 já existe com outro conteúdo; reconciliar antes de publicar.';
    END IF;
    novo := anterior.conteudo || E'\n\n' || regra;
    IF length(novo)>60000 THEN RAISE EXCEPTION 'Prompt ultrapassa limite de publicação.'; END IF;
    SELECT coalesce(max(v.versao),0)+1 INTO proxima FROM public.nina_instrucoes_versoes v
      WHERE v.clinica_id IS NOT DISTINCT FROM anterior.clinica_id AND v.escopo=anterior.escopo;
    UPDATE public.nina_instrucoes_versoes SET status='arquivada' WHERE id=anterior.id;
    INSERT INTO public.nina_instrucoes_versoes (clinica_id,escopo,versao,conteudo,status,comentario,versao_anterior_id,publicado_em)
      VALUES (anterior.clinica_id,anterior.escopo,proxima,novo,'publicada',comentario_novo,anterior.id,now());
  END LOOP;
END;
$grupo$;
