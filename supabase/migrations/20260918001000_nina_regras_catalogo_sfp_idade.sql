-- Nova versão global de WhatsApp. Preserva textos/versões anteriores e rascunhos.
-- WhatsApp real e homologação carregam a mesma versão publicada.
DO $migration$
DECLARE
  anterior public.nina_instrucoes_versoes;
  proxima integer;
  conteudo_novo text;
BEGIN
  LOCK TABLE public.nina_instrucoes_versoes IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO anterior FROM public.nina_instrucoes_versoes
    WHERE clinica_id IS NULL AND escopo = 'whatsapp' AND status = 'publicada';
  IF anterior.id IS NULL OR position($marker$REGRAS DO CATÁLOGO — SFP, PROFISSIONAL GENÉRICO E IDADE MÍNIMA (2026-09-17)$marker$ in anterior.conteudo) > 0 THEN
    RETURN;
  END IF;
  SELECT coalesce(max(versao), 0) + 1 INTO proxima FROM public.nina_instrucoes_versoes
    WHERE clinica_id IS NULL AND escopo = 'whatsapp';
  conteudo_novo := replace(anterior.conteudo, $old$Preserve o sentido dos critérios publicados. Quando a fonte informar apenas uma idade, apresente literalmente “Critério informado: X”, incluindo a unidade publicada, inclusive nos atendimentos de cardiologia infantil. Não acrescente “a partir de”, “até”, idade mínima, máxima ou faixa etária quando esse operador ou intervalo não estiver expresso na fonte. Por exemplo, uma fonte com “Idade/critério informado: 1 mês” deve ser apresentada como “Critério informado: 1 mês”, sem transformar esse valor em limite de idade.$old$,
    'As idades publicadas são mínimas: informe a partir do número e unidade cadastrados, inclusive zero.');
  conteudo_novo := conteudo_novo || E'

' || $rules$REGRAS DO CATÁLOGO — SFP, PROFISSIONAL GENÉRICO E IDADE MÍNIMA (2026-09-17)
Estas regras substituem orientações anteriores sobre SFP, técnico/técnica e interpretação de idades, tanto no WhatsApp real quanto na homologação.
- Se o procedimento ou a consulta solicitada tiver o nome do profissional SFP, encaminhe para atendimento humano usando solicitar_atendente_humano. Não prossiga com informações ou agendamento automático desse item. Só confirme a transferência quando a ferramenta confirmar; em caso de falha, informe a dificuldade sem afirmar que transferiu. Uma opção SFP em uma lista ampla não torna as outras opções exclusivas da equipe: identifique o atendimento solicitado.
- Se o nome do profissional for técnico ou técnica (com ou sem acento, independentemente de maiúsculas), não informe esse nome nem invente outro. Omita a identificação do profissional e forneça normalmente as demais informações publicadas, inclusive valores, preparo, horários, modalidade e restrições. A regra também vale para resumos e confirmações.
- As idades informadas no catálogo são idades mínimas. Apresente como “a partir de X anos” ou “a partir de X meses”, conservando o número e a unidade. Exemplos: 18 anos → a partir de 18 anos; 3 anos → a partir de 3 anos; 0 anos → a partir de 0 anos. Uma idade isolada em “Idade/critério informado” também é mínima. Não transforme idade mínima em idade exata, máxima ou faixa. Campo sem idade continua desconhecido. Não interprete preços, horários, duração do preparo ou periodicidade como idade.$rules$;
  UPDATE public.nina_instrucoes_versoes SET status = 'arquivada', updated_at = now()
    WHERE id = anterior.id;
  INSERT INTO public.nina_instrucoes_versoes
    (clinica_id, escopo, versao, conteudo, status, comentario, versao_anterior_id, publicado_em)
  VALUES (NULL, 'whatsapp', proxima, conteudo_novo, 'publicada',
    'Regra de negócio: SFP com equipe humana, omitir técnico/técnica e interpretar idades como mínimas.',
    anterior.id, now());
END
$migration$;
