import { REGRA_IDADE_NAO_INFORMADA } from "./regras-administrativas-confirmadas";

/** Vocabulário de consulta. Caminhos relativos a UM registro retornado pela ferramenta. */
export type CampoCatalogo = {
  campo: string;
  rotulo: string;
  caminho: string;
  orientacao: string;
};
type Tipo = "servico" | "profissional";
const comuns: CampoCatalogo[] = [
  {
    campo: "id_catalogo",
    rotulo: "Identificação do registro",
    caminho: "id",
    orientacao: "Identificador interno, nunca mostrar ao paciente.",
  },
  {
    campo: "nome_atendimento",
    rotulo: "Nome do atendimento",
    caminho: "procedimento",
    orientacao: "Nome oficial do exame ou consulta; preservar complementos.",
  },
  {
    campo: "variacoes_nome",
    rotulo: "Dicionário de formas de falar",
    caminho: "extras.estrutura.aliases",
    orientacao:
      "Ajuda a localizar o cadastro; não prova preço, vaga nem equivalência entre cadastros diferentes.",
  },
  {
    campo: "atendimentos_detalhados",
    rotulo: "Regras por atendimento",
    caminho: "extras.atendimentos_publicados",
    orientacao:
      "Quando houver vários atendimentos, selecionar o bloco solicitado e manter seus valores, idade, modalidade e horários juntos.",
  },
  {
    campo: "criterio_idade",
    rotulo: "Idade e critérios por atendimento",
    caminho: "extras.atendimentos_publicados[].criterio_publicado",
    orientacao:
      "Conferir também idade_minima, unidade_idade e complemento do mesmo bloco. " +
      REGRA_IDADE_NAO_INFORMADA,
  },
  {
    campo: "complementos_atendimento",
    rotulo: "Regras específicas confirmadas",
    caminho: "extras.atendimentos_publicados[].complemento",
    orientacao:
      "Modalidade, idade/unidade, critério adicional, chegada até, referência da recorrência, situação do preço, inclusões e acréscimos pertencem ao mesmo atendimento.",
  },
  {
    campo: "formas_pagamento",
    rotulo: "Valores e formas de pagamento",
    caminho: "extras.formas_pagamento",
    orientacao:
      "Ler forma, valor, condicao e observacao de cada entrada. Não misturar condições nem usar só o preço resumido.",
  },
  {
    campo: "pedido_medico",
    rotulo: "Necessidade de pedido médico",
    caminho: "extras.estrutura.pedido_medico",
    orientacao: "obrigatorio, dispensado ou nao_informado. Ausência nunca significa dispensa.",
  },
  {
    campo: "encaminhamento_obrigatorio",
    rotulo: "Atendimento humano obrigatório",
    caminho: "extras.atendimento_humano_obrigatorio",
    orientacao: "Aplicar ao atendimento solicitado, conforme as regras já existentes.",
  },
  {
    campo: "ocultar_nome_profissional",
    rotulo: "Proteção de nomes de equipe",
    caminho: "extras.omitir_nome_profissional",
    orientacao: "Respeitar antes de citar executantes ou nomes de equipe ao paciente.",
  },
  {
    campo: "observacoes_completas",
    rotulo: "Condições públicas em conjunto",
    caminho: "observacoes",
    orientacao:
      "Conferir como complemento. Uma condição relevante pode estar no texto público, mesmo sem campo específico preenchido.",
  },
];
const especificos: Record<Tipo, CampoCatalogo[]> = {
  servico: [
    {
      campo: "id_procedimento",
      rotulo: "Vínculo com o procedimento",
      caminho: "extras.procedimento_id",
      orientacao: "Vínculo interno; não é prova de vaga disponível.",
    },
    {
      campo: "descricao_exame",
      rotulo: "Descrição do exame/procedimento",
      caminho: "extras.descricao_publica",
      orientacao: "Descrição pública cadastrada, sem completar indicação clínica.",
    },
    {
      campo: "profissionais_executantes",
      rotulo: "Quem realiza o exame",
      caminho: "extras.executantes",
      orientacao:
        "Cada entrada contém nome, horarios e observacao do mesmo executante. Não usar o preço da consulta deste médico para o exame.",
    },
    {
      campo: "nome_medico",
      rotulo: "Nome de cada executante",
      caminho: "extras.executantes[].nome",
      orientacao: "Pode haver mais de um executante; não selecionar um arbitrariamente.",
    },
    {
      campo: "horarios_habituais",
      rotulo: "Horários habituais dos executantes",
      caminho: "extras.executantes[].horarios",
      orientacao: "Escala habitual do executante da mesma entrada, nunca disponibilidade de vagas.",
    },
    {
      campo: "preparo_status",
      rotulo: "Situação do preparo",
      caminho: "extras.preparo_status",
      orientacao:
        "informado, sem_preparo ou nao_informado. Desconhecido não significa sem preparo.",
    },
    {
      campo: "preparo_instrucoes",
      rotulo: "Orientações de preparo",
      caminho: "preparo",
      orientacao:
        "Somente orientações publicadas, sem acrescentar jejum ou suspensão de medicamentos.",
    },
    {
      campo: "restricoes",
      rotulo: "Requisitos e restrições",
      caminho: "extras.restricoes",
      orientacao: "Ler junto com preparo, pedido médico e regras do atendimento.",
    },
    {
      campo: "valor_referencia",
      rotulo: "Valor sem forma de pagamento definida",
      caminho: "extras.valor_referencia",
      orientacao: "Não converte valor genérico em dinheiro, Pix ou cartão.",
    },
    {
      campo: "observacao_valores",
      rotulo: "Condições gerais dos valores",
      caminho: "extras.valor_observacao",
      orientacao: "Preservar junto com o preço correspondente.",
    },
  ],
  profissional: [
    {
      campo: "nome_medico",
      rotulo: "Nome do profissional",
      caminho: "medico",
      orientacao: "Nome deste registro; não confundir com especialidade ou outro profissional.",
    },
    {
      campo: "especialidades",
      rotulo: "Especialidades",
      caminho: "extras.especialidades",
      orientacao: "Pode haver várias; conservar a especialidade e o atendimento escolhidos.",
    },
    {
      campo: "unidade_atendimento",
      rotulo: "Unidade de atendimento",
      caminho: "extras.unidade",
      orientacao: "Unidade deste cadastro. Endereço e contato vêm de dados_da_clinica.",
    },
    {
      campo: "atende_consultorio",
      rotulo: "Atende no consultório",
      caminho: "extras.atende_consultorio",
      orientacao: "true, false ou null; null significa desconhecido.",
    },
    {
      campo: "modalidade_atendimento",
      rotulo: "Hora marcada, chegada ou ficha",
      caminho: "extras.modalidade_atendimento",
      orientacao: "Ler com orientacao_atendimento; não inferir modalidade pelo nome da consulta.",
    },
    {
      campo: "orientacao_modalidade",
      rotulo: "Como funciona o atendimento",
      caminho: "extras.orientacao_atendimento",
      orientacao: "Conservar exigência de pré-agendamento quando houver.",
    },
    {
      campo: "horarios_habituais",
      rotulo: "Dias e horários habituais",
      caminho: "extras.horarios",
      orientacao:
        "Cada entrada contém dia, inicio, fim, recorrencia e observacao. Ler juntos; quinzenal não vira semanal.",
    },
    {
      campo: "convenios",
      rotulo: "Convênios cadastrados",
      caminho: "extras.convenios",
      orientacao: "Ler com convenios_status. Lista vazia não comprova que não aceita.",
    },
    {
      campo: "convenios_status",
      rotulo: "Situação dos convênios",
      caminho: "extras.convenios_status",
      orientacao: "aceita, nao_aceita ou nao_informado.",
    },
    {
      campo: "descricao_consulta",
      rotulo: "Descrição e condições da consulta",
      caminho: "extras.observacao_publica",
      orientacao: "Preservar condições de cada consulta, incluindo critérios de idade.",
    },
    {
      campo: "aviso_vigente",
      rotulo: "Aviso temporário válido",
      caminho: "extras.aviso_vigente",
      orientacao:
        "Texto e datas do aviso válido na data consultada. null significa nenhum aviso vigente retornado.",
    },
  ],
};

export function camposDoCatalogo(tipo: Tipo): CampoCatalogo[] {
  return [...comuns, ...especificos[tipo]].map((c) => ({ ...c }));
}

/** Metadados, não um segundo prompt. Enviados uma vez por retorno, sem copiar os valores. */
export function mapaCamposResultado(tipos: readonly Tipo[]) {
  const caminhos = (campos: CampoCatalogo[]) =>
    Object.fromEntries(campos.map((c) => [c.campo, c.caminho]));
  return {
    versao: 1,
    referencia:
      "Caminhos relativos a cada item de records ou registros; [] significa cada entrada da lista.",
    comuns: caminhos(comuns),
    ...(tipos.includes("servico") ? { exames_procedimentos: caminhos(especificos.servico) } : {}),
    ...(tipos.includes("profissional")
      ? { consultas_profissionais: caminhos(especificos.profissional) }
      : {}),
    fontes_externas: {
      vagas_disponiveis: "consultar_disponibilidade",
      funcionamento_clinica: "horario_funcionamento",
      endereco_contato: "dados_da_clinica",
    },
    campo_ausente:
      "Informação desconhecida. O mapa descreve o formato, não comprova o preenchimento nem a disponibilidade de um serviço.",
  };
}
