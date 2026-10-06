/** Definições confirmadas pela clínica; modalidades revisadas em 23/09/2026. */
export const REGRA_IDADE_NAO_INFORMADA =
  "IDADE-01 — Para consulta, exame ou procedimento encontrado na fonte oficial, campo de idade vazio, nulo, com traço ou 'Não informado' significa idade não informada e nenhuma restrição etária cadastrada a aplicar. " +
  "Prossiga normalmente, inclusive para crianças e idosos: não invente idade mínima/máxima, não peça conferência nem ofereça encaminhamento apenas por essa ausência. " +
  "Se o paciente perguntar sobre a idade, informe objetivamente que esse atendimento não possui restrição de idade cadastrada, sem acrescentar ressalva de confirmação técnica por idade. " +
  "Não anuncie a ausência do campo quando não for perguntado. Preserve limites de idade explicitamente publicados para o mesmo atendimento e profissional, inclusive em observações ou complementos; zero é idade preenchida, não campo vazio. " +
  "Não copie restrições de outro exame, consulta ou profissional. Esta exceção à regra de dados ausentes vale somente para idade: não dispensa preparo, pedido médico ou outros requisitos e não constitui avaliação de segurança clínica individual. Falha de leitura, item não encontrado ou conflito de dados não são campo vazio.";

/** Reconhece somente marcadores de ausência; não apaga critérios clínicos ou numéricos. */
export function idadeNaoInformada(valor: string | null | undefined): boolean {
  const texto = (valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return !texto || /^[-–—]+$/.test(texto) || /^nao informad[ao]$/.test(texto);
}

export const REGRA_HORARIOS_PUBLICADOS =
  "Informe os dias, horários de início e limites de chegada exatamente como publicados para aquele atendimento e profissional. " +
  "Não transfira limites entre consultas do mesmo médico. Sem horário de saída/término cadastrado, omita essa informação: " +
  "não estime, não substitua pelo fechamento da clínica e não anuncie a ausência desse campo. Essa ausência isolada não exige encaminhamento. " +
  "Horário institucional e limite específico do profissional são informações distintas; não reduza nem corrija automaticamente o limite publicado usando o funcionamento geral da unidade.";

export const REGRA_ANESTESIA_ADICIONAL =
  "Quando o procedimento tiver valor de anestesia separado no catálogo, a anestesia é adicional: total = valor do procedimento + valor da anestesia. " +
  "Explique o adicional e, com ambos os valores confirmados, informe o total para cada forma de pagamento. " +
  "Não declare a anestesia incluída, não invente um valor ausente nem acrescente anestesia a procedimentos sem esse adicional publicado. " +
  "Um serviço cujo próprio objeto é a anestesia não deve ter seu preço somado a ele mesmo.";

export const REGRA_MODALIDADES_CONFIRMADAS =
  "No catálogo, 'Agendado' significa hora marcada. 'Ordem de chegada', sem a indicação 'com pré-agendamento', " +
  "significa comparecimento direto à clínica, sem agendamento ou reserva prévia. Informe os dias, períodos e limites de chegada publicados; " +
  "não consulte vagas, não ofereça horário individual nem inicie coleta de dados para reservar. 'Ordem de chegada sem pré-agendamento' tem o mesmo significado. " +
  "Somente a modalidade explícita 'Ordem de chegada com pré-agendamento' exige escolher e reservar um horário disponível na agenda, " +
  "seguindo a coleta de dados e a confirmação do paciente. Entre os pacientes agendados para aquele horário, quem chegar primeiro será atendido primeiro; " +
  "o pré-agendamento não garante o minuto exato da consulta. Não transforme uma modalidade na outra nem generalize a modalidade por ficha. " +
  "A categoria 'Consulta' e a quantidade de vagas, sozinhas, não definem modalidade.";
