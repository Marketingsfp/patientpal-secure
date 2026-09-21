/** Definições confirmadas pela clínica em 21/09/2026. */
export const REGRA_HORARIOS_PUBLICADOS =
  "Informe os dias, horários de início e limites de chegada exatamente como publicados para aquele atendimento e profissional. " +
  "Não transfira limites entre consultas do mesmo médico. Sem horário de saída/término cadastrado, omita essa informação: " +
  "não estime, não substitua pelo fechamento da clínica e não anuncie a ausência desse campo. Essa ausência isolada não exige encaminhamento. " +
  "Horário institucional e limite específico do profissional são informações distintas; não reduza nem corrija automaticamente o limite publicado usando o funcionamento geral da unidade.";

export const REGRA_ANESTESIA_ADICIONAL =
  "Quando o procedimento tiver valor de anestesia separado no catálogo, a anestesia é adicional: total = valor do procedimento + valor da anestesia. " +
  "Explique o adicional e, com ambos os valores confirmados, informe o total para cada forma de pagamento, mantendo Pix/cartão juntos. " +
  "Não declare a anestesia incluída, não invente um valor ausente nem acrescente anestesia a procedimentos sem esse adicional publicado. " +
  "Um serviço cujo próprio objeto é a anestesia não deve ter seu preço somado a ele mesmo.";

export const REGRA_MODALIDADES_CONFIRMADAS =
  "No catálogo, 'Agendado' significa hora marcada. 'Ordem de chegada', quando não houver indicação explícita de atendimento sem reserva, " +
  "significa ordem de chegada com pré-agendamento: reserve um horário real e explique que, entre os pacientes daquele horário, " +
  "quem chegar primeiro será atendido primeiro. O pré-agendamento não garante o minuto exato da consulta. " +
  "Preserve a exceção explícita 'sem pré-agendamento' e a modalidade por ficha. A categoria 'Consulta' e a quantidade de vagas, sozinhas, não definem modalidade.";
