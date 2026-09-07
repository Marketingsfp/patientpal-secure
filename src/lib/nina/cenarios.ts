/**
 * FASE 5 — Biblioteca de cenários automatizados da homologação da Nina.
 *
 * Módulo puro (sem rede e sem banco): categorias, critérios esperados,
 * avaliação determinística do resultado e distribuição dos cenários entre os
 * 10 Leads de Teste. A avaliação aqui NÃO usa IA — é verificação objetiva do
 * que aconteceu na conversa de teste.
 */

export type CategoriaCenario =
  | "informacao"
  | "agendamento"
  | "agenda"
  | "crm"
  | "rag"
  | "transferencia"
  | "prompt"
  | "memoria"
  | "correcao_dados"
  | "fallback"
  | "erro"
  | "seguranca"
  | "regressao";

export const CATEGORIAS: { valor: CategoriaCenario; rotulo: string }[] = [
  { valor: "informacao", rotulo: "Informação" },
  { valor: "agendamento", rotulo: "Agendamento" },
  { valor: "agenda", rotulo: "Agenda" },
  { valor: "crm", rotulo: "CRM" },
  { valor: "rag", rotulo: "RAG" },
  { valor: "transferencia", rotulo: "Transferência" },
  { valor: "prompt", rotulo: "Prompt" },
  { valor: "memoria", rotulo: "Memória" },
  { valor: "correcao_dados", rotulo: "Correção de dados" },
  { valor: "fallback", rotulo: "Fallback" },
  { valor: "erro", rotulo: "Erro" },
  { valor: "seguranca", rotulo: "Segurança" },
  { valor: "regressao", rotulo: "Regressão" },
];

export const ROTULO_CATEGORIA = Object.fromEntries(
  CATEGORIAS.map((c) => [c.valor, c.rotulo]),
) as Record<CategoriaCenario, string>;

export type TipoCriterio =
  | "contem_texto"
  | "nao_contem_texto"
  | "usou_ferramenta"
  | "nao_usou_ferramenta"
  | "transferiu"
  | "nao_transferiu"
  | "sem_erro";

export const TIPOS_CRITERIO: { valor: TipoCriterio; rotulo: string; precisaValor: boolean }[] = [
  { valor: "contem_texto", rotulo: "A resposta deve conter", precisaValor: true },
  { valor: "nao_contem_texto", rotulo: "A resposta não pode conter", precisaValor: true },
  { valor: "usou_ferramenta", rotulo: "Deve usar a ferramenta", precisaValor: true },
  { valor: "nao_usou_ferramenta", rotulo: "Não pode usar a ferramenta", precisaValor: true },
  { valor: "transferiu", rotulo: "Deve transferir para humano", precisaValor: false },
  { valor: "nao_transferiu", rotulo: "Não pode transferir para humano", precisaValor: false },
  { valor: "sem_erro", rotulo: "Não pode ocorrer erro técnico", precisaValor: false },
];

export type Criterio = { tipo: TipoCriterio; valor?: string | null };

export type ResultadoItem = "aprovado" | "reprovado" | "inconclusivo";

/** Fatos observados na conversa de teste, lidos do banco (nunca do navegador). */
export type FatosExecucao = {
  respostasNina: string[];
  ferramentas: string[];
  transferida: boolean;
  houveErro: boolean;
  turnos: number;
};

export type CriterioAvaliado = Criterio & { ok: boolean; detalhe: string };

function normaliza(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Avalia UM critério contra os fatos observados. */
export function avaliarCriterio(criterio: Criterio, fatos: FatosExecucao): CriterioAvaliado {
  const alvo = normaliza(String(criterio.valor ?? "").trim());
  const texto = normaliza(fatos.respostasNina.join("\n"));
  const ferramentas = fatos.ferramentas.map(normaliza);

  switch (criterio.tipo) {
    case "contem_texto": {
      const ok = !!alvo && texto.includes(alvo);
      return { ...criterio, ok, detalhe: ok ? "Texto encontrado na resposta." : "Texto não apareceu na resposta." };
    }
    case "nao_contem_texto": {
      const ok = !alvo || !texto.includes(alvo);
      return { ...criterio, ok, detalhe: ok ? "Texto proibido não apareceu." : "Texto proibido apareceu na resposta." };
    }
    case "usou_ferramenta": {
      const ok = !!alvo && ferramentas.some((f) => f.includes(alvo));
      return { ...criterio, ok, detalhe: ok ? "Ferramenta utilizada." : "Ferramenta não foi utilizada." };
    }
    case "nao_usou_ferramenta": {
      const ok = !alvo || !ferramentas.some((f) => f.includes(alvo));
      return { ...criterio, ok, detalhe: ok ? "Ferramenta não foi utilizada." : "Ferramenta proibida foi utilizada." };
    }
    case "transferiu":
      return {
        ...criterio,
        ok: fatos.transferida,
        detalhe: fatos.transferida ? "Conversa transferida." : "Não houve transferência.",
      };
    case "nao_transferiu":
      return {
        ...criterio,
        ok: !fatos.transferida,
        detalhe: fatos.transferida ? "Houve transferência indevida." : "Sem transferência.",
      };
    case "sem_erro":
      return {
        ...criterio,
        ok: !fatos.houveErro,
        detalhe: fatos.houveErro ? "Ocorreu erro técnico na execução." : "Nenhum erro técnico.",
      };
    default:
      return { ...criterio, ok: false, detalhe: "Critério desconhecido." };
  }
}

/**
 * Resultado do cenário: aprovado quando todos os critérios passam.
 * Sem resposta da Nina ou sem critérios, o resultado é INCONCLUSIVO — nunca
 * "aprovado por omissão".
 */
export function avaliarCenario(
  criterios: Criterio[],
  fatos: FatosExecucao,
): { resultado: ResultadoItem; avaliados: CriterioAvaliado[] } {
  const avaliados = criterios.map((c) => avaliarCriterio(c, fatos));
  if (!fatos.respostasNina.length) return { resultado: "inconclusivo", avaliados };
  if (!criterios.length) return { resultado: "inconclusivo", avaliados };
  return { resultado: avaliados.every((a) => a.ok) ? "aprovado" : "reprovado", avaliados };
}

/**
 * Distribui os cenários entre os leads disponíveis (rodízio).
 * Ex.: Lead 01 → cenário 1, Lead 02 → cenário 2 … Lead 01 → cenário 11.
 */
export function distribuirCenarios<C extends { id: string }, L extends { id: string }>(
  cenarios: C[],
  leads: L[],
): { cenario: C; lead: L; ordem: number }[] {
  if (!leads.length) return [];
  return cenarios.map((cenario, i) => ({
    cenario,
    lead: leads[i % leads.length]!,
    ordem: i,
  }));
}

/** Agrupa os itens por lead, preservando a ordem — cada lead roda em série. */
export function filasPorLead<T extends { lead: { id: string } }>(itens: T[]): T[][] {
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const fila = mapa.get(item.lead.id) ?? [];
    fila.push(item);
    mapa.set(item.lead.id, fila);
  }
  return [...mapa.values()];
}

/** Modelos de cenário sugeridos para a primeira carga da biblioteca. */
export const CENARIOS_MODELO: {
  nome: string;
  categoria: CategoriaCenario;
  objetivo: string;
  descricao: string;
  criterios: Criterio[];
  maxTurnos: number;
}[] = [
  {
    nome: "Agendar cardiologista",
    categoria: "agendamento",
    objetivo: "Paciente quer marcar uma consulta com cardiologista.",
    descricao: "Verifica se a Nina oferece horários reais de cardiologia.",
    criterios: [{ tipo: "sem_erro" }, { tipo: "nao_transferiu" }],
    maxTurnos: 6,
  },
  {
    nome: "Preço de ultrassonografia",
    categoria: "informacao",
    objetivo: "Paciente quer saber o preço de uma ultrassonografia.",
    descricao: "Verifica resposta de valores sem transferir para humano.",
    criterios: [{ tipo: "sem_erro" }],
    maxTurnos: 4,
  },
  {
    nome: "Cancelar consulta",
    categoria: "agenda",
    objetivo: "Paciente quer cancelar uma consulta já marcada.",
    descricao: "Verifica o caminho de cancelamento.",
    criterios: [{ tipo: "sem_erro" }],
    maxTurnos: 6,
  },
  {
    nome: "Horário de funcionamento",
    categoria: "rag",
    objetivo: "Paciente pergunta o horário de funcionamento da clínica.",
    descricao: "Verifica se a base de conhecimento é usada.",
    criterios: [{ tipo: "sem_erro" }],
    maxTurnos: 3,
  },
  {
    nome: "Falar com atendente",
    categoria: "transferencia",
    objetivo: "Paciente insiste em falar com um atendente humano.",
    descricao:
      "Verifica transferência, protocolo e mensagem de encaminhamento ao paciente.",
    criterios: [{ tipo: "sem_erro" }, { tipo: "transferiu" }],
    maxTurnos: 4,
  },
  {
    nome: "Informação fora do catálogo publicado",
    categoria: "fallback",
    objetivo:
      "Paciente pergunta algo que não existe no catálogo publicado da clínica.",
    descricao:
      "A Nina deve reconhecer a ausência, encaminhar para a equipe e informar o protocolo.",
    criterios: [{ tipo: "sem_erro" }, { tipo: "transferiu" }],
    maxTurnos: 4,
  },
  {
    nome: "Transferência com setor conhecido",
    categoria: "transferencia",
    objetivo: "Paciente trata de um assunto com setor estruturado de destino.",
    descricao: "A mensagem pode citar o setor correto, com protocolo.",
    criterios: [{ tipo: "sem_erro" }, { tipo: "transferiu" }],
    maxTurnos: 5,
  },
  {
    nome: "Transferência sem setor definido",
    categoria: "transferencia",
    objetivo: "Handoff sem destino estruturado.",
    descricao: 'A mensagem não pode inventar setor: deve falar em "nossa equipe".',
    criterios: [{ tipo: "sem_erro" }, { tipo: "transferiu" }],
    maxTurnos: 4,
  },
];
