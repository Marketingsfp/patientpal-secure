/** Definições confirmadas pela clínica; modalidades revisadas em 23/09/2026. */
export const REGRA_IDADE_NAO_INFORMADA =
  "IDADE-01 — Para consulta, exame ou procedimento encontrado na fonte oficial, campo de idade vazio, nulo, com traço ou 'Não informado' significa idade não informada e nenhuma restrição etária cadastrada a aplicar. " +
  "Prossiga normalmente, inclusive para crianças e idosos: não invente idade mínima/máxima, não peça conferência nem ofereça encaminhamento apenas por essa ausência. " +
  "Só fale de idade quando houver limite publicado para o atendimento. Sem limite publicado, não mencione idade nem ausência de restrição, inclusive quando o paciente apenas informar a idade (ex.: 'ela tem 15 anos'). " +
  "Somente se o paciente perguntar diretamente se existe restrição ou idade mínima, responda objetivamente que esse atendimento não possui restrição de idade cadastrada, sem ressalva de confirmação técnica por idade. Preserve limites de idade explicitamente publicados para o mesmo atendimento e profissional, inclusive em observações ou complementos; zero é idade preenchida, não campo vazio. " +
  "Não copie restrições de outro exame, consulta ou profissional. Esta exceção à regra de dados ausentes vale somente para idade: não dispensa preparo, pedido médico ou outros requisitos e não constitui avaliação de segurança clínica individual. Falha de leitura, item não encontrado ou conflito de dados não são campo vazio.";

/** Reconhece somente marcadores de ausência; não apaga critérios clínicos ou numéricos. */
export function idadeNaoInformada(valor: string | null | undefined): boolean {
  const texto = (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
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

/**
 * Decisões da clínica de 14/10/2026 (Fase 6 da homologação de consultas). Antes
 * as mesmas perguntas ora eram respondidas, ora encaminhadas.
 */
export const REGRA_DEBITO_CREDITO =
  "PAGAMENTO-02 — Débito e crédito são cartão: o valor de Pix/cartão cadastrado vale para débito e para crédito à vista. " +
  "Quando o paciente perguntar o valor no débito ou no crédito, responda com esse valor, sem encaminhar e sem pedir confirmação à equipe. " +
  "Parcelamento só conforme a condição cadastrada; sem condição de parcelamento cadastrada, diga que o parcelamento é com a nossa recepção.";

export const REGRA_ACOMPANHANTE =
  "ACOMPANHANTE-01 — O paciente pode levar acompanhante, e o responsável pode acompanhar a consulta, o exame ou o procedimento. " +
  "Quando perguntarem, responda que pode, sim; menores de idade devem estar acompanhados do responsável. Não encaminhe só por essa pergunta. " +
  "Restrição publicada para o atendimento (ex.: sala de exame sem acompanhante) prevalece.";

export const REGRA_EXPLICACAO_ESPECIALIDADE =
  "EXPLICACAO-01 — Quando o paciente perguntar para que serve uma especialidade, um exame ou um procedimento, você pode dar uma explicação geral em uma frase curta e neutra (ex.: 'o otorrinolaringologista cuida de ouvido, nariz e garganta'). " +
  "Não dê diagnóstico, não diga se o caso do paciente precisa daquele atendimento nem indique tratamento ou medicamento. " +
  "Depois da frase, siga com as informações do catálogo (profissionais, horários, valores). Descrição publicada no catálogo prevalece.";

export const AVISO_AGENDAMENTO_PELA_EQUIPE = "Agendamento feito pela nossa equipe";

export const REGRA_AGENDAMENTO_PELA_EQUIPE =
  "EQUIPE-01 — Profissional com atendimento_humano_obrigatorio aparece na lista da especialidade junto com os demais, com o nome e o aviso '" +
  AVISO_AGENDAMENTO_PELA_EQUIPE +
  "' (dias e horários publicados, quando houver; sem horário publicado, não invente nem diga que não há). " +
  "Não o omita da lista. Se o paciente escolher esse profissional, encaminhe para a equipe; não consulte vagas dele.";
