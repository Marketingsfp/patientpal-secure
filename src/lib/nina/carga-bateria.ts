/**
 * Bateria por profissional nos testes de carga: Luna faz o papel do paciente.
 *
 * Módulo puro (sem banco, rede ou modelo): monta os cenários a partir do catálogo
 * publicado (cada consulta de cada profissional × variação de paciente), prevê o
 * desfecho esperado, distribui os passos entre os leads e avalia o resultado com
 * fatos lidos do banco depois da conversa.
 */
import { atendimentosEstruturados, lerEstrutura } from "./catalogo-estrutura";
import {
  MODALIDADES_ATENDIMENTO,
  permiteReserva,
  type ModalidadeResolvida,
} from "./modalidade-atendimento";

export const VERSAO_BATERIA = 1 as const;
/**
 * REGRA DA HOMOLOGAÇÃO: o lead só é reiniciado no início da carga. Por isso cada
 * cenário usa um lead próprio e uma bateria tem no máximo 10 cenários.
 */
export const LIMITES_BATERIA = {
  cenariosMax: 10,
  variacoesPorConsulta: 3,
  turnosMin: 4,
  turnosMax: 12,
  turnosPadrao: 10,
  simultaneasPadrao: 3,
  /** Enviar logo após reiniciar o lead travou a Nina em 24/09/2026. */
  esperaAposReinicioMs: 15_000,
  janelaVagasDias: 60,
  /** Folga por mensagem (Luna + Nina) para o prazo total do teste. */
  segundosPorTurno: 150,
  duracaoMaxS: 4 * 3600,
} as const;

export type VariacaoBateria = {
  id: string;
  rotulo: string;
  instrucao: string;
  paraFamiliar?: boolean;
};

/** Perfis que encontraram defeitos reais nas simulações manuais de 24/09/2026. */
export const VARIACOES_BATERIA: VariacaoBateria[] = [
  {
    id: "direto",
    rotulo: "Paciente direto",
    instrucao: "Você é objetivo: diz o que precisa e responde exatamente o que foi perguntado.",
  },
  {
    id: "leigo",
    rotulo: "Descreve o problema com palavras leigas",
    instrucao:
      "Na primeira mensagem descreva o problema de saúde e o tipo de médico com palavras simples, como um leigo (sem o nome técnico da especialidade). Só confirme a especialidade se perguntarem.",
  },
  {
    id: "dia_preferido",
    rotulo: "Só pode em um dia da semana",
    instrucao:
      "Você só pode em um dia da semana: pergunte em quais dias o profissional atende e escolha um desses dias.",
  },
  {
    id: "preco_primeiro",
    rotulo: "Pergunta o preço antes de marcar",
    instrucao:
      "Antes de marcar, pergunte quanto custa a consulta e as formas de pagamento; depois decida marcar.",
  },
  {
    id: "tudo_junto",
    rotulo: "Manda horário, nome e nascimento juntos",
    instrucao:
      "Quando escolher o horário, envie na MESMA mensagem o horário escolhido, o nome e a data de nascimento do paciente.",
  },
  {
    id: "apressado",
    rotulo: "Paciente apressado",
    instrucao:
      "Você tem pressa: escreve mensagens muito curtas, sem saudação longa, e quer o primeiro horário disponível.",
  },
  {
    id: "desconfiado",
    rotulo: "Desconfiado com valores",
    instrucao:
      "Você questiona o preço e pergunta a diferença entre Pix e dinheiro antes de confirmar.",
  },
  {
    id: "familiar",
    rotulo: "Marca para um familiar",
    instrucao:
      "A consulta é para um familiar seu (os dados do paciente abaixo são dele). Deixe claro que está marcando para outra pessoa.",
    paraFamiliar: true,
  },
];

export type ProfissionalCatalogo = {
  id: string;
  nome: string;
  medico_id: string | null;
  observacao_publica: string | null;
  estrutura?: unknown;
};

export type ConsultaCatalogo = {
  profissionalId: string;
  medicoId: string | null;
  medicoNome: string;
  chave: string;
  consulta: string;
  especialidade: string | null;
  dinheiro: string | null;
  pixCartao: string | null;
  modalidade: ModalidadeResolvida | null;
  idadeMinima: number | null;
  unidadeIdade: "anos" | "meses" | null;
  criterio: string | null;
  horarios: string | null;
  encaminhamentoHumano: boolean;
};

export type EsperadoBateria =
  | "agendar"
  | "orientar_chegada"
  | "sem_vaga"
  | "encaminhar"
  | "indefinido";

export const ROTULO_ESPERADO: Record<EsperadoBateria, string> = {
  agendar: "Agendar com o profissional",
  orientar_chegada: "Orientar ordem de chegada, sem horário marcado",
  sem_vaga: "Informar falta de vaga ou encaminhar",
  encaminhar: "Encaminhar para a equipe",
  indefinido: "Sem previsão (modalidade não definida no catálogo)",
};

export type CenarioBateria = ConsultaCatalogo & {
  id: string;
  ordem: number;
  titulo: string;
  variacao: VariacaoBateria;
  esperado: EsperadoBateria;
  vagasPrevistas: number | null;
  paciente: { nome: string; nascimento: string; idadeAnos: number };
};

export type ConfigBateria = {
  versao: typeof VERSAO_BATERIA;
  turnos: number;
  esperaAposReinicioMs: number;
  janelaVagasDias: number;
  duracaoMaxS: number;
  cenarios: CenarioBateria[];
};

export type TipoItemBateria = "turno" | "verificar" | "devolver";
export type ItemBateria = {
  indice: number;
  leadId: string;
  leadIndice: number;
  slot: number;
  cenario: string;
  cenarioId: string;
  mensagem: string;
  tipo: TipoItemBateria;
  ordemNoCenario: number;
};

const normal = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Cada bloco "CONSULTA ..." publicado vira uma consulta; exames e procedimentos ficam fora. */
export function consultasDoCatalogo(profissionais: ProfissionalCatalogo[]): ConsultaCatalogo[] {
  const consultas: ConsultaCatalogo[] = [];
  for (const p of [...profissionais].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))) {
    const estrutura = lerEstrutura(p.estrutura);
    const itens = atendimentosEstruturados(p.observacao_publica, p.estrutura, p.nome, "Consulta");
    for (const a of itens) {
      if (!/^consulta\b/.test(normal(a.atendimento))) continue;
      const c = a.complemento;
      consultas.push({
        profissionalId: p.id,
        medicoId: p.medico_id,
        medicoNome: p.nome,
        chave: a.chave,
        consulta: a.atendimento,
        especialidade: a.especialidade,
        dinheiro: a.dinheiro,
        pixCartao: a.pix_cartao,
        modalidade: c?.modalidade ?? a.modalidade ?? null,
        idadeMinima: c?.idade_minima ?? a.idade_minima,
        unidadeIdade: c?.unidade_idade ?? a.unidade_idade,
        criterio: a.criterio_publicado,
        horarios: a.horarios_publicados,
        encaminhamentoHumano: estrutura.encaminhamento_humano === true,
      });
    }
  }
  return consultas;
}

/** Previsão a partir do catálogo e das vagas livres; a verificação confere o que houve. */
export function esperadoDaConsulta(c: ConsultaCatalogo, vagas: number | null): EsperadoBateria {
  if (c.encaminhamentoHumano) return "encaminhar";
  if (c.modalidade === "chegada_sem_pre_agendamento") return "orientar_chegada";
  if (!c.medicoId) return "sem_vaga";
  if (!c.modalidade || c.modalidade === "nao_definida") return "indefinido";
  if (!permiteReserva(c.modalidade)) return "indefinido";
  if (vagas === null) return "agendar";
  return vagas > 0 ? "agendar" : "sem_vaga";
}

function dataNascimento(hoje: Date, anos: number, ordem: number): string {
  const d = new Date(
    Date.UTC(hoje.getUTCFullYear() - anos, (ordem * 5) % 12, 1 + ((ordem * 7) % 27)),
  );
  if (d.getTime() > Date.UTC(hoje.getUTCFullYear() - anos, hoje.getUTCMonth(), hoje.getUTCDate()))
    d.setUTCFullYear(d.getUTCFullYear() - 1);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** Dados fictícios e rastreáveis, coerentes com a idade mínima publicada. */
export function pacienteDoCenario(
  c: ConsultaCatalogo,
  variacao: VariacaoBateria,
  ordem: number,
  hoje = new Date(),
): CenarioBateria["paciente"] {
  const minimo =
    c.idadeMinima == null
      ? 0
      : c.unidadeIdade === "meses"
        ? Math.ceil(c.idadeMinima / 12)
        : c.idadeMinima;
  // Familiar: criança quando a consulta aceita; senão, um parente adulto mais velho.
  const base = variacao.paraFamiliar ? (minimo <= 8 ? 8 : 67) : 30 + ((ordem * 7) % 30);
  const idadeAnos = Math.max(base, minimo + 1);
  return {
    nome: `Simulação Teste ${String(ordem).padStart(2, "0")}`,
    nascimento: dataNascimento(hoje, idadeAnos, ordem),
    idadeAnos,
  };
}

export function tituloCenario(c: Pick<CenarioBateria, "medicoNome" | "consulta" | "variacao">) {
  return `${c.medicoNome} · ${c.consulta} · ${c.variacao.rotulo}`;
}

/** Uma consulta por profissional selecionado × variações, em ordem estável. */
export function montarCenariosBateria(entrada: {
  consultas: ConsultaCatalogo[];
  vagasPorMedico: Record<string, number | null>;
  profissionalIds?: string[];
  variacoesPorConsulta: number;
  hoje?: Date;
}): CenarioBateria[] {
  const selecionados = entrada.profissionalIds ? new Set(entrada.profissionalIds) : null;
  const porConsulta = Math.min(
    LIMITES_BATERIA.variacoesPorConsulta,
    Math.max(1, Math.trunc(entrada.variacoesPorConsulta)),
  );
  const cenarios: CenarioBateria[] = [];
  let rodizio = 0;
  for (const c of entrada.consultas) {
    if (selecionados && !selecionados.has(c.profissionalId)) continue;
    const vagas = c.medicoId ? (entrada.vagasPorMedico[c.medicoId] ?? null) : null;
    for (let v = 0; v < porConsulta; v++) {
      const variacao = VARIACOES_BATERIA[rodizio++ % VARIACOES_BATERIA.length]!;
      const ordem = cenarios.length + 1;
      const cenario: CenarioBateria = {
        ...c,
        // A ordem garante identidade única mesmo com blocos repetidos no catálogo.
        id: `${ordem}:${c.profissionalId}:${normal(c.consulta).replace(/[^a-z0-9]+/g, "-")}:${variacao.id}`,
        ordem,
        titulo: "",
        variacao,
        esperado: esperadoDaConsulta(c, vagas),
        vagasPrevistas: vagas,
        paciente: pacienteDoCenario(c, variacao, ordem, entrada.hoje),
      };
      cenario.titulo = tituloCenario(cenario);
      cenarios.push(cenario);
    }
  }
  return cenarios;
}

export function normalizarTurnos(turnos: number | undefined) {
  return Math.min(
    LIMITES_BATERIA.turnosMax,
    Math.max(LIMITES_BATERIA.turnosMin, Math.trunc(turnos ?? LIMITES_BATERIA.turnosPadrao)),
  );
}

/** Prazo do teste: rodadas de conversas simultâneas × mensagens, com folga. */
export function duracaoBateriaS(cenarios: number, simultaneas: number, turnos: number) {
  const rodadas = Math.ceil(Math.max(1, cenarios) / Math.max(1, simultaneas));
  return Math.min(
    LIMITES_BATERIA.duracaoMaxS,
    rodadas * turnos * LIMITES_BATERIA.segundosPorTurno + 600,
  );
}

/**
 * Um lead por cenário: até `turnos` mensagens do paciente, a verificação e a
 * devolução da vaga, em série. A fila intercala os leads para que avancem juntos.
 */
export function montarItensBateria(
  cenarios: CenarioBateria[],
  leads: { id: string; indice: number }[],
  turnos: number,
): ItemBateria[] {
  if (!cenarios.length)
    throw new Error("Selecione ao menos um profissional com consulta publicada.");
  if (cenarios.length > Math.min(leads.length, LIMITES_BATERIA.cenariosMax))
    throw new Error(
      `Cada disparo testa no máximo ${LIMITES_BATERIA.cenariosMax} cenários, um por lead. Divida a seleção em lotes.`,
    );
  const porLead = cenarios.map((c, slot) => {
    const lead = leads[slot]!;
    const base = {
      leadId: lead.id,
      leadIndice: lead.indice,
      slot,
      cenario: c.titulo,
      cenarioId: c.id,
    };
    return [
      ...Array.from({ length: turnos }, (_, t) => ({
        ...base,
        tipo: "turno" as const,
        ordemNoCenario: t,
        mensagem: "Mensagem escrita pela Luna durante a conversa",
      })),
      {
        ...base,
        tipo: "verificar" as const,
        ordemNoCenario: turnos,
        mensagem: "Verificação do resultado",
      },
      {
        ...base,
        tipo: "devolver" as const,
        ordemNoCenario: turnos + 1,
        mensagem: "Devolução da vaga",
      },
    ];
  });
  const fila: ItemBateria[] = [];
  for (let posicao = 0; posicao < turnos + 2; posicao++)
    for (const lista of porLead) fila.push({ ...lista[posicao]!, indice: fila.length });
  return fila;
}

export function configBateria(config: unknown): ConfigBateria | null {
  const b = (config as { _bateria?: ConfigBateria } | null)?._bateria;
  return b?.versao === VERSAO_BATERIA && Array.isArray(b.cenarios) ? b : null;
}

export function itemBateria(item: unknown): ItemBateria | null {
  const i = item as ItemBateria | null;
  return i && ["turno", "verificar", "devolver"].includes(i.tipo) && typeof i.cenarioId === "string"
    ? i
    : null;
}

/** Valores em reais citados num texto, em centavos. */
export function valoresEmReais(texto: string | null | undefined): number[] {
  const valores: number[] = [];
  for (const m of (texto ?? "").matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?/g))
    valores.push(Number(m[1]!.replace(/\./g, "")) * 100 + Number(m[2] ?? 0));
  return valores;
}

export type FatosCenarioBateria = {
  respostasNina: string[];
  mensagensPaciente: string[];
  agendamentos: { medicoId: string | null; inicio: string | null; procedimento: string | null }[];
  encaminhada: boolean;
  errosTecnicos: number;
  fim: string | null;
  latenciasMs: number[];
};

export type AvaliacaoBateria = {
  resultado: "aprovado" | "reprovado" | "inconclusivo";
  motivos: string[];
  observacoes: string[];
  preco: "citado" | "divergente" | "nao_citado" | "sem_preco_no_catalogo";
  agendouComAlvo: boolean;
  primeiraMensagemCitouNome: boolean;
};

const citaNome = (texto: string, nome: string) => {
  const partes = normal(nome)
    .split(" ")
    .filter((p) => p.length >= 4 && !["dra.", "dr.", "doutor", "doutora"].includes(p));
  const t = normal(texto);
  return partes.some((p) =>
    new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t),
  );
};

/** Regras objetivas; o que é preferência de atendimento fica como observação. */
export function avaliarCenarioBateria(
  c: Pick<
    CenarioBateria,
    "medicoId" | "medicoNome" | "esperado" | "dinheiro" | "pixCartao" | "modalidade"
  >,
  f: FatosCenarioBateria,
): AvaliacaoBateria {
  const motivos: string[] = [];
  const observacoes: string[] = [];
  const doAlvo = f.agendamentos.filter((a) => c.medicoId && a.medicoId === c.medicoId);
  const deOutro = f.agendamentos.filter((a) => !c.medicoId || a.medicoId !== c.medicoId);
  const esperadosPreco = [...valoresEmReais(c.dinheiro), ...valoresEmReais(c.pixCartao)];
  const citados = f.respostasNina.flatMap(valoresEmReais);
  const preco: AvaliacaoBateria["preco"] = !esperadosPreco.length
    ? "sem_preco_no_catalogo"
    : citados.some((v) => esperadosPreco.includes(v))
      ? "citado"
      : citados.length
        ? "divergente"
        : "nao_citado";
  const primeiraMensagemCitouNome = Boolean(
    f.mensagensPaciente[0] && citaNome(f.mensagensPaciente[0], c.medicoNome),
  );
  if (primeiraMensagemCitouNome)
    observacoes.push("A primeira mensagem do paciente citou o nome do profissional.");
  if (preco === "divergente")
    observacoes.push("A Nina citou valores, mas nenhum igual ao preço publicado desta consulta.");
  if (!f.respostasNina.length) {
    motivos.push("A Nina não respondeu nenhuma mensagem deste cenário.");
    return {
      resultado: "inconclusivo",
      motivos,
      observacoes,
      preco,
      agendouComAlvo: false,
      primeiraMensagemCitouNome,
    };
  }
  if (f.errosTecnicos > 0)
    motivos.push(
      `${f.errosTecnicos} mensagem(ns) terminaram em erro técnico ou sem resposta no prazo.`,
    );
  if (deOutro.length) motivos.push("Agendou com outro profissional, não com o do cenário.");
  const falouChegada = f.respostasNina.some((r) =>
    /ordem de chegada|por ordem|chegar a partir|chegada/i.test(r),
  );
  switch (c.esperado) {
    case "agendar":
      if (!doAlvo.length)
        motivos.push(
          f.encaminhada
            ? "Encaminhou para a equipe em vez de agendar."
            : `Não concluiu o agendamento${f.fim ? ` (fim: ${f.fim})` : ""}.`,
        );
      break;
    case "orientar_chegada":
      if (doAlvo.length) motivos.push("Marcou horário para atendimento por ordem de chegada.");
      else if (!falouChegada && !f.encaminhada)
        motivos.push("Não orientou o atendimento por ordem de chegada.");
      break;
    case "sem_vaga":
      // A previsão usa uma janela estimada; vaga encontrada mais adiante não é erro.
      if (doAlvo.length)
        observacoes.push("Havia vaga além da previsão: a Nina agendou com o profissional certo.");
      else if (
        !f.encaminhada &&
        !f.respostasNina.some((r) =>
          /n[aã]o (?:h[aá]|tem|temos|encontrei)[^.]{0,40}vaga|sem vagas?|nenhuma vaga|agenda (?:est[aá] )?(?:cheia|lotada)/i.test(
            r,
          ),
        )
      )
        motivos.push("Não informou a falta de vaga nem encaminhou para a equipe.");
      break;
    case "encaminhar":
      if (!f.encaminhada)
        motivos.push("O catálogo pede encaminhamento, mas a conversa não foi encaminhada.");
      if (doAlvo.length) motivos.push("Agendou uma consulta que o catálogo manda encaminhar.");
      break;
    case "indefinido":
      observacoes.push(
        `Modalidade não definida no catálogo${c.modalidade && c.modalidade !== "nao_definida" ? ` (${MODALIDADES_ATENDIMENTO[c.modalidade]})` : ""}: sem previsão, o resultado fica apenas registrado.`,
      );
      break;
  }
  return {
    resultado: motivos.length
      ? "reprovado"
      : c.esperado === "indefinido"
        ? "inconclusivo"
        : "aprovado",
    motivos,
    observacoes,
    preco,
    agendouComAlvo: doAlvo.length > 0,
    primeiraMensagemCitouNome,
  };
}

export type LinhaRelatorioBateria = {
  cenarioId: string;
  ordem: number;
  leadIndice: number | null;
  medicoNome: string;
  consulta: string;
  variacao: string;
  esperado: EsperadoBateria;
  esperadoRotulo: string;
  situacao: "aguardando" | "conversando" | "verificado" | "devolvido";
  resultado: AvaliacaoBateria["resultado"] | null;
  motivos: string[];
  observacoes: string[];
  preco: AvaliacaoBateria["preco"] | null;
  agendamentos: { inicio: string | null }[];
  mensagensEnviadas: number;
  latenciaMediaMs: number | null;
  fim: string | null;
  vagasDevolvidas: number | null;
};

/** Uma linha por cenário, montada só com os passos gravados deste teste. */
export function relatorioBateria(
  bateria: ConfigBateria,
  plano: unknown[],
  passos: { indice: number; status: string; resultado?: any; latencia_ms?: number | null }[],
  vagasPendentes: number,
) {
  const itens = plano.map(itemBateria).filter((i): i is ItemBateria => Boolean(i));
  const porIndice = new Map(passos.map((p) => [p.indice, p]));
  const linhas: LinhaRelatorioBateria[] = bateria.cenarios.map((c) => {
    const doCenario = itens.filter((i) => i.cenarioId === c.id);
    const passo = (tipo: TipoItemBateria) =>
      porIndice.get(doCenario.find((i) => i.tipo === tipo)?.indice ?? -1);
    const turnos = doCenario
      .filter((i) => i.tipo === "turno")
      .map((i) => porIndice.get(i.indice))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    const enviados = turnos.filter((t) => t.status !== "dispensado");
    const verificacao = passo("verificar")?.resultado ?? null;
    const devolucao = passo("devolver")?.resultado ?? null;
    const latencias = enviados
      .filter((t) => t.status === "ok" && Number.isFinite(t.latencia_ms))
      .map((t) => Number(t.latencia_ms));
    return {
      cenarioId: c.id,
      ordem: c.ordem,
      leadIndice: doCenario[0]?.leadIndice ?? null,
      medicoNome: c.medicoNome,
      consulta: c.consulta,
      variacao: c.variacao.rotulo,
      esperado: c.esperado,
      esperadoRotulo: ROTULO_ESPERADO[c.esperado],
      situacao: devolucao
        ? "devolvido"
        : verificacao
          ? "verificado"
          : turnos.length
            ? "conversando"
            : "aguardando",
      resultado: verificacao?.avaliacao?.resultado ?? null,
      motivos: verificacao?.avaliacao?.motivos ?? [],
      observacoes: verificacao?.avaliacao?.observacoes ?? [],
      preco: verificacao?.avaliacao?.preco ?? null,
      agendamentos: (verificacao?.agendamentos ?? []).map((a: any) => ({
        inicio: a.inicio ?? null,
      })),
      mensagensEnviadas: enviados.length,
      latenciaMediaMs: latencias.length
        ? Math.round(latencias.reduce((s, v) => s + v, 0) / latencias.length)
        : null,
      fim:
        verificacao?.fim ?? turnos.find((t) => t.status === "dispensado")?.resultado?.fim ?? null,
      vagasDevolvidas:
        typeof devolucao?.vagasDevolvidas === "number" ? devolucao.vagasDevolvidas : null,
    };
  });
  const contar = (r: LinhaRelatorioBateria["resultado"]) =>
    linhas.filter((l) => l.resultado === r).length;
  return {
    linhas,
    totais: {
      cenarios: linhas.length,
      aprovados: contar("aprovado"),
      reprovados: contar("reprovado"),
      inconclusivos: contar("inconclusivo"),
      emAndamento: linhas.filter((l) => l.resultado === null).length,
      vagasPendentes,
    },
    tokensLuna: passos.reduce(
      (n, p) => n + Number(p.resultado?.luna?.entrada ?? 0) + Number(p.resultado?.luna?.saida ?? 0),
      0,
    ),
  };
}
