/**
 * Explicação de cada opção do catálogo: o que ela muda no atendimento da Nina.
 * Texto descreve o comportamento ATUAL do código (auditoria de 12/10/2026);
 * ao mudar uma regra, atualize a explicação correspondente.
 */
/** Liga o formulário por seções e os botões “Como ler” na clínica. */
export const FLAG_CATALOGO_ESTRUTURADO = "catalogo_estruturado";

export type AjudaCatalogo = {
  titulo: string;
  /** O que a Nina faz com esta opção. */
  efeito: string;
  /** Cuidado ou limitação que a equipe precisa conhecer. */
  atencao?: string;
};

/** "Sincronizar com Clínica OS" preserva só estes campos; os demais vêm da origem. */
const PRESERVADOS_NA_SINCRONIZACAO = new Set<string>([
  "aliases",
  "nina_pode_agendar",
  "nota_interna",
]);

export const AJUDA_CATALOGO = {
  // Exames e procedimentos
  nome_servico: {
    titulo: "Procedimento",
    efeito:
      "É o nome que a Nina usa para encontrar o item quando o paciente pede. As regras “Nina pode agendar” e “Encaminhamento humano obrigatório” também são ligadas a este nome.",
    atencao:
      "Ao renomear, confira a modalidade de cada atendimento: complementos do nome antigo ficam separados, mas a modalidade deles ainda conta na decisão de agendar.",
  },
  vinculo_procedimento: {
    titulo: "Vincular ao cadastro do sistema",
    efeito:
      "Liga o item ao procedimento da agenda. Sem vínculo, a Nina informa o exame, mas não consegue consultar vaga nem agendar.",
    atencao: "O vínculo não copia valor nem preparo da origem.",
  },
  valor_referencia: {
    titulo: "Valor de referência",
    efeito:
      "Só é enviado à Nina quando não existe nenhuma forma de pagamento; ela informa o valor dizendo que a forma de pagamento não foi definida.",
    atencao:
      "Com formas de pagamento valoradas, este campo é calculado (menor valor) e não é enviado. Se houver forma de pagamento sem valor, o valor digitado aqui também não chega à Nina.",
  },
  valor_observacao: {
    titulo: "Observação do valor",
    efeito: "A Nina recebe junto do preço, como texto.",
    atencao: "Não fica ligada a nenhuma forma de pagamento específica.",
  },
  descricao_publica: {
    titulo: "Descrição pública",
    efeito:
      "A Nina lê o texto inteiro. Linhas com rótulos (“Especialidade:”, “Dias e horários:”, “Dinheiro:”, “Observação:”) são separadas em atendimentos, e a modalidade escrita em “Observação:” é usada pela trava da agenda.",
    atencao:
      "Preço e horário escritos aqui não são conferidos com os campos próprios: se divergirem, a Nina recebe as duas versões.",
  },
  preparo: {
    titulo: "Preparo do exame",
    efeito:
      "A Nina informa o preparo exatamente como está escrito. Se dois cadastros do mesmo exame tiverem preparos diferentes, ela encaminha para a equipe.",
    atencao: "Em branco, a Nina diz que o preparo não foi informado — nunca que não há preparo.",
  },
  preparo_status: {
    titulo: "Situação do preparo",
    efeito:
      "“A clínica confirmou que não exige preparo” faz a Nina dizer isso ao paciente. Com texto de preparo preenchido, a situação vira “cadastrado” automaticamente.",
    atencao: "Escolher “Preparo cadastrado” sem escrever o preparo não tem efeito.",
  },
  restricoes: {
    titulo: "Restrições e requisitos",
    efeito: "A Nina recebe como “Requisitos” e repassa ao paciente.",
    atencao:
      "Não aciona nenhuma regra. Para exigir pedido médico, use o campo “Precisa de pedido médico?”.",
  },
  pedido_medico: {
    titulo: "Precisa de pedido médico?",
    efeito:
      "“Obrigatório” faz a Nina pedir a foto do pedido médico. Quando a clínica ativa “pedido médico antes da agenda”, ela só procura horário depois de receber o pedido (exames com hora marcada ou pré-agendamento).",
    atencao: "“Não necessário” só é informado ao paciente; não muda o fluxo.",
  },
  nota_interna: {
    titulo: "Nota interna",
    efeito: "Não é enviada à Nina do WhatsApp nem ao paciente.",
    atencao:
      "É enviada à IA de “Criar/Editar com IA” do catálogo. Não escreva dados de pacientes aqui.",
  },
  executantes: {
    titulo: "Quem realiza / horários",
    efeito:
      "Liga o exame ao médico da agenda e informa à Nina quem realiza e em que dias. Os horários são a escala habitual, nunca vaga disponível.",
    atencao: "Linhas sem profissional escolhido são descartadas ao salvar.",
  },
  formas_pagamento: {
    titulo: "Formas de pagamento",
    efeito:
      "A Nina informa o valor de cada forma (dinheiro, Pix, cartão) com a condição e a observação de cada uma.",
    atencao:
      "Quando o profissional tem mais de um atendimento, escreva o nome do atendimento em “Quando / condição”: a Nina usa esse nome para ligar o preço ao atendimento certo.",
  },

  // Consultas e profissionais
  nome_profissional: {
    titulo: "Nome do profissional",
    efeito:
      "A Nina usa para encontrar o profissional e, sem vínculo, para localizá-lo na agenda pelo nome.",
  },
  vinculo_medico: {
    titulo: "Vincular ao cadastro do sistema",
    efeito:
      "Identifica o médico na agenda. A Nina só consegue consultar vagas e agendar com este vínculo, e as regras de encaminhamento obrigatório do profissional seguem este médico.",
    atencao: "O vínculo não copia os dados da origem; use “Sincronizar com Clínica OS” para isso.",
  },
  especialidades: {
    titulo: "Especialidades",
    efeito:
      "A Nina usa para encontrar o profissional quando o paciente pede uma especialidade e para listar as especialidades da clínica.",
  },
  unidade: {
    titulo: "Unidade",
    efeito: "A Nina informa a unidade de atendimento. Nenhuma regra usa este campo.",
  },
  atende_consultorio: {
    titulo: "Atende no consultório",
    efeito: "A Nina recebe apenas como informação. Nenhuma regra usa este campo.",
  },
  modalidade_profissional: {
    titulo: "Modalidade de atendimento",
    efeito:
      "Define como a Nina conduz a consulta quando o atendimento não tem modalidade própria: hora marcada, chegada com pré-agendamento ou ficha podem ser agendadas (se “Nina pode agendar” estiver ligado); ordem de chegada sem pré-agendamento ela só informa.",
    atencao:
      "Sem modalidade, a Nina informa e encaminha à equipe. A modalidade de cada atendimento, quando preenchida, tem prioridade sobre esta.",
  },
  convenios: {
    titulo: "Convênios que atende",
    efeito: "A Nina informa os convênios listados. Não existe trava por convênio.",
    atencao: "Se a lista estiver preenchida, ela vale mesmo que a situação diga “não aceita”.",
  },
  horarios_profissional: {
    titulo: "Horários por dia da semana",
    efeito:
      "É a escala habitual que a Nina informa. Se o paciente pede um profissional sem dia e hora cadastrados, a Nina encaminha para a equipe.",
    atencao:
      "Linha com dia mas sem horário conta como “sem escala”. A recorrência (quinzenal etc.) é só informada; a Nina não calcula a próxima data.",
  },
  observacao_publica: {
    titulo: "Informações públicas dos atendimentos",
    efeito:
      "A Nina lê o texto inteiro. Blocos com “Especialidade:” viram atendimentos, com modalidade, idade, horários e preços próprios.",
    atencao:
      "Se um único bloco não tiver “Especialidade:”, nenhum bloco é separado. Preços escritos aqui não são conferidos com as formas de pagamento.",
  },
  aviso_dia: {
    titulo: "Aviso do dia",
    efeito: "A Nina só informa o aviso dentro do período “Válido de / até”.",
    atencao: "Sem datas, o aviso vale até ser apagado.",
  },

  // Regras da Nina e organização
  categoria: {
    titulo: "Categoria do atendimento",
    efeito: "Organiza o catálogo. Não muda o atendimento da Nina.",
  },
  abrangencia: {
    titulo: "Abrangência do cadastro",
    efeito:
      "Organiza o catálogo. Não muda o atendimento da Nina. “Categoria geral” impede a sincronização com o ClinicaOS.",
  },
  grupo: {
    titulo: "Grupo ao qual pertence",
    efeito: "Organiza o catálogo. Não copia preços nem regras e não muda o atendimento da Nina.",
  },
  encaminhamento_humano: {
    titulo: "Encaminhamento humano obrigatório",
    efeito:
      "Quando o paciente pergunta por este item, a Nina transfere a conversa para a equipe na hora, sem passar as informações antes. O paciente recebe aviso da transferência.",
    atencao:
      "Marcado em um profissional, vale para todos os atendimentos feitos por ele. Tem prioridade sobre “Nina pode agendar”.",
  },
  nina_pode_agendar: {
    titulo: "Nina pode agendar",
    efeito:
      "Ligado, a Nina agenda este item quando o paciente quiser. Desligado, ela passa as informações e, se o paciente quiser marcar, encaminha para a equipe confirmar o horário.",
    atencao:
      "Só funciona com modalidade hora marcada, chegada com pré-agendamento ou ficha, com o agendamento da Nina ativo na clínica e com o vínculo à agenda.",
  },
  convenios_status: {
    titulo: "Situação dos convênios",
    efeito: "A Nina informa se o profissional aceita ou não convênios.",
    atencao: "Se a lista de convênios estiver preenchida, a lista prevalece.",
  },
  aliases: {
    titulo: "Dicionário (formas de falar)",
    efeito:
      "Ajuda a Nina a encontrar o item quando o paciente usa outro nome, sigla ou erro de digitação, inclusive ao ler a foto do pedido médico.",
    atencao: "Não prova preço, vaga nem equivalência entre cadastros diferentes.",
  },

  // Complementos de cada atendimento
  complemento_modalidade: {
    titulo: "Modalidade do atendimento",
    efeito:
      "Decide como a Nina conduz este atendimento: agendar (com “Nina pode agendar”), informar e encaminhar, ou só informar (ordem de chegada sem pré-agendamento).",
    atencao:
      "Tem prioridade sobre a modalidade do profissional. Atendimentos do mesmo item com modalidades diferentes fazem a Nina tratar o item como “sem modalidade” e encaminhar.",
  },
  complemento_situacao_preco: {
    titulo: "Situação do preço",
    efeito: "A Nina recebe esta situação como informação do atendimento.",
    atencao:
      "Não existe trava automática: “Precisa de orçamento” ou “Incluído” não impedem a Nina de informar um preço que esteja cadastrado.",
  },
  complemento_idade: {
    titulo: "Idade mínima confirmada",
    efeito: "A Nina recebe como critério do atendimento. Não existe trava automática por idade.",
  },
  complemento_chegada: {
    titulo: "Limite de chegada confirmado",
    efeito: "A Nina recebe o horário limite de chegada deste atendimento.",
  },
  complemento_recorrencia: {
    titulo: "Data de referência da recorrência",
    efeito: "Registro para a equipe. A Nina não calcula a próxima semana do atendimento.",
  },
  complemento_criterio: {
    titulo: "Outros critérios confirmados",
    efeito: "A Nina recebe como critério do atendimento. Nenhuma regra automática.",
  },
  complemento_inclui: {
    titulo: "O que está incluído",
    efeito: "A Nina recebe e pode informar o que está incluído no atendimento.",
  },
  complemento_acrescimos: {
    titulo: "Acréscimos",
    efeito: "A Nina recebe os acréscimos e quando se aplicam. Não há cálculo automático.",
  },

  // Atendimentos estruturados (fonte única dos fatos do item)
  atendimentos: {
    titulo: "Atendimentos",
    efeito:
      "É a única fonte de horários, preços, modalidade, idade e regras deste item. A Nina recebe um resumo gerado daqui, e os campos antigos (formas de pagamento, horários, quem realiza) são calculados automaticamente ao salvar.",
    atencao:
      "Todos os atendimentos precisam ter a mesma modalidade para o item ser agendado; faltando em algum, a Nina informa e encaminha.",
  },
  atendimento_nome: {
    titulo: "Nome do atendimento",
    efeito:
      "É como a Nina apresenta este atendimento e como ela distingue preços e horários quando o item tem mais de um.",
  },
  atendimento_especialidade: {
    titulo: "Especialidade do atendimento",
    efeito:
      "A Nina usa para encontrar o atendimento quando o paciente pede a especialidade e para não misturar atendimentos diferentes do mesmo profissional.",
  },
  atendimento_horarios: {
    titulo: "Horários deste atendimento",
    efeito:
      "É a escala habitual que a Nina informa para este atendimento. Nunca é vaga: a disponibilidade real vem da agenda.",
    atencao:
      "Profissional sem nenhum horário cadastrado faz a Nina encaminhar quando o paciente pede por ele. Em horário quinzenal, informe a data de referência.",
  },
  atendimento_executantes: {
    titulo: "Quem realiza e horários",
    efeito:
      "Liga o atendimento ao médico da agenda e informa à Nina quem realiza e em que dias. Os horários são escala habitual, nunca vaga.",
    atencao: "Linhas sem profissional escolhido impedem o salvamento.",
  },
  atendimento_precos: {
    titulo: "Preços",
    efeito:
      "A Nina informa cada valor com a forma de pagamento e a condição (ex.: até 3x). Formas reconhecidas: Dinheiro, Pix/cartão, Cartão e Pix; outras são informadas como escritas.",
    atencao: "Em branco significa valor não informado, nunca gratuito.",
  },
  atendimento_observacao: {
    titulo: "Observação do atendimento",
    efeito: "A Nina recebe junto do atendimento, como texto.",
    atencao:
      "Não escreva preço, horário, dia da semana, modalidade ou idade aqui: o salvamento é bloqueado para manter cada dado num lugar só.",
  },
  texto_livre: {
    titulo: "Texto para o paciente",
    efeito:
      "Descrição livre que a Nina pode usar para explicar o item, junto do resumo gerado dos atendimentos.",
    atencao:
      "Sem fatos: preço, horário, dia da semana, modalidade, idade e rótulos como “Dinheiro:” bloqueiam o salvamento. Esses dados ficam só nos atendimentos.",
  },
  converter_estruturado: {
    titulo: "Converter para atendimentos",
    efeito:
      "Lê o texto e os campos antigos e monta os atendimentos estruturados. Nada é salvo até você conferir e salvar; o que não puder ser lido com segurança aparece como pendência.",
    atencao:
      "Depois de salvo, sincronização com o Clínica OS, importação e edição com IA deixam de alterar este item.",
  },
} satisfies Record<string, AjudaCatalogo>;

export type ChaveAjudaCatalogo = keyof typeof AJUDA_CATALOGO;

/** Campo que “Sincronizar com Clínica OS” não substitui. */
export function preservadoNaSincronizacao(chave: ChaveAjudaCatalogo): boolean {
  return PRESERVADOS_NA_SINCRONIZACAO.has(chave);
}
