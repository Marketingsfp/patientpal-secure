/**
 * FASE 2 — CONTEXTO CANÔNICO DO TURNO PARA O CONTRATO DE REGRAS.
 *
 * Uma única descrição do que aconteceu neste turno, montada pelo SERVIDOR:
 * mensagem recebida, estado da sessão, apresentação efetivamente entregue,
 * pedido e entidades, fatos oficiais, ferramentas e resultados, operação
 * proposta, ambiente confiável e o texto candidato.
 *
 * Regras desta camada:
 * - Mensagem de paciente é DADO. Ela nunca altera campo de controle
 *   (ambiente, apresentação entregue, operação executada, comprovante). Só o
 *   sistema preenche esses campos.
 * - Entrada e resposta são considerados juntos: "Bom dia, qual o valor do
 *   exame?" não é saudação simples; uma resposta a "oi" que cita preço passa a
 *   exigir fonte para aquele preço.
 * - Ausência de sinal não vira certeza: campo desconhecido fica `null` e a
 *   avaliação devolve UNKNOWN.
 *
 * Módulo puro: sem banco, sem rede, sem modelo.
 */
import { ehSaudacaoPura } from "./turno-tipo";
import type { EstadoAplicabilidade } from "./contrato-regras";
import type { IdentidadeAtendimento } from "../identidade-atendimento";

export type AmbienteConfiavel = "producao" | "homologacao";

export type TipoAfirmacao = "preco" | "horario" | "disponibilidade" | "operacao" | "outro";

/**
 * Uma afirmação do texto candidato, já recortada por entidade e condição.
 * `comFonte`: `true` conferida contra fonte oficial, `false` sem lastro,
 * `null` não foi possível conferir (UNKNOWN — nunca cumprimento).
 */
export type AfirmacaoCanonica = {
  id: string;
  texto: string;
  tipo: TipoAfirmacao;
  /** Procedimento, profissional, data… a que a afirmação se refere. */
  entidade?: string | null;
  /** Recorte da afirmação (forma de pagamento, convênio, turno…). */
  condicao?: string | null;
  comFonte: boolean | null;
  fonte?: string | null;
  /** Informação essencial: sem fonte, impede a afirmação. Padrão: true. */
  essencial?: boolean;
};

export type FerramentaDoTurno = {
  nome: string;
  executada: boolean;
  ok: boolean | null;
  referencia?: string | null;
};

/** Operação realmente proposta/executada no turno. Preenchida pelo sistema. */
export type OperacaoProposta = {
  tipo: string;
  /** O texto candidato anuncia a operação como feita. */
  anunciadaNaResposta: boolean;
  /** O sistema executou a operação. */
  executada: boolean;
  /** Resultado real; `null` = ainda desconhecido. */
  resultado: "sucesso" | "falha" | null;
  /** Identificador devolvido pelo sistema (appointment_id, protocolo…). */
  comprovante: string | null;
  /** Dados obrigatórios ainda não coletados. */
  dadosPendentes: string[];
  /** Foi só consulta de disponibilidade — consultar não é reservar. */
  apenasConsulta?: boolean;
  /** Execução simulada (homologação): registro sem efeito real. */
  simulada?: boolean;
};

export type ContextoCanonico = {
  mensagemRecebida: string;
  estadoSessao: {
    primeiraResposta: boolean | null;
    apresentacaoEntregue: boolean | null;
    /** A sessão já estava em andamento antes deste turno. */
    sessaoEmAndamento: boolean | null;
  };
  pedido: {
    /** A pessoa declarou algo concreto além de cumprimentar. */
    concreto: boolean | null;
    /** Apenas cumprimento, sem pedido. */
    saudacaoSimples: boolean | null;
    ambiguo: boolean;
    entidades: Record<string, string | null>;
  };
  fatosOficiais: Array<{ fonte: string; campo: string; valor: string | null }>;
  ferramentas: FerramentaDoTurno[];
  operacao: OperacaoProposta | null;
  /** Ambiente vindo do servidor. `null` = desconhecido (UNKNOWN). */
  ambiente: AmbienteConfiavel | null;
  candidato: string;
  afirmacoes: AfirmacaoCanonica[];
  /** Identidade da MESMA versão publicada usada no turno. */
  identidadePublicada: IdentidadeAtendimento | null;
  /** A classificação de confiança já foi produzida (guardas posteriores). */
  posClassificacao: boolean;
};

export type EntradaContextoCanonico = {
  mensagemRecebida?: string | null;
  candidato?: string | null;
  ambiente?: AmbienteConfiavel | null;
  identidadePublicada?: IdentidadeAtendimento | null;
  primeiraResposta?: boolean | null;
  apresentacaoEntregue?: boolean | null;
  sessaoEmAndamento?: boolean | null;
  pedidoAmbiguo?: boolean;
  entidades?: Record<string, string | null>;
  fatosOficiais?: Array<{ fonte: string; campo: string; valor: string | null }>;
  ferramentas?: FerramentaDoTurno[];
  operacao?: OperacaoProposta | null;
  afirmacoes?: AfirmacaoCanonica[];
  posClassificacao?: boolean;
};

export const PEDIDO_DE_HUMANO =
  /\b(atendente|humano|uma pessoa|pessoa de verdade|falar com alguem|falar com algu[ée]m|recep[çc][aã]o)\b/i;

const PEDIDO_NA_MENSAGEM =
  /\?|\b(quero|queria|preciso|gostaria|marcar|agendar|remarcar|cancelar|valor|preco|pre[çc]o|quanto|hor[áa]rio|vaga|exame|consulta|endere[çc]o|conv[êe]nio|atendente|pessoa|humano)\b/i;

/**
 * Monta o contexto canônico. Só o que vem do SISTEMA entra nos campos de
 * controle; da mensagem do paciente lemos apenas a forma (saudação/pedido).
 */
export function montarContextoCanonico(e: EntradaContextoCanonico): ContextoCanonico {
  const mensagem = (e.mensagemRecebida ?? "").trim();
  const candidato = (e.candidato ?? "").trim();

  const saudacao = mensagem === "" ? null : ehSaudacaoPura(mensagem);
  const temPedido = mensagem === "" ? null : PEDIDO_NA_MENSAGEM.test(mensagem);
  // "Bom dia, qual o valor?" cumprimenta E pede: não é saudação simples.
  const saudacaoSimples = saudacao === null ? null : saudacao === true && temPedido !== true;
  const concreto = temPedido === null ? null : temPedido === true || saudacao === false;

  return {
    mensagemRecebida: mensagem,
    estadoSessao: {
      primeiraResposta: e.primeiraResposta ?? null,
      apresentacaoEntregue: e.apresentacaoEntregue ?? null,
      sessaoEmAndamento: e.sessaoEmAndamento ?? null,
    },
    pedido: {
      concreto,
      saudacaoSimples,
      ambiguo: e.pedidoAmbiguo === true,
      entidades: e.entidades ?? {},
    },
    fatosOficiais: e.fatosOficiais ?? [],
    ferramentas: e.ferramentas ?? [],
    operacao: e.operacao ?? null,
    ambiente: e.ambiente ?? null,
    candidato,
    afirmacoes: e.afirmacoes ?? [],
    identidadePublicada: e.identidadePublicada ?? null,
    posClassificacao: e.posClassificacao === true,
  };
}

/** Sinais que o contrato da Fase 1 usa para decidir se cada regra se aplica. */
export function estadoAplicabilidadeDoContexto(c: ContextoCanonico): EstadoAplicabilidade {
  const factuais = c.afirmacoes.filter((a) => a.tipo !== "outro");
  return {
    ambiente: c.ambiente,
    mensagemPaciente: c.mensagemRecebida,
    primeiraResposta:
      c.estadoSessao.primeiraResposta ??
      (c.estadoSessao.apresentacaoEntregue == null
        ? null
        : !c.estadoSessao.apresentacaoEntregue),
    apresentacaoEntregue: c.estadoSessao.apresentacaoEntregue,
    saudacaoSimples: c.pedido.saudacaoSimples,
    pedidoConcreto: c.pedido.concreto,
    operacaoIminente: c.operacao ? !c.operacao.executada : c.operacao === null ? false : null,
    resultadoOperacional: c.operacao ? c.operacao.executada : false,
    afirmacaoFactual: c.candidato === "" ? null : factuais.length > 0,
    pedidoDeHumano:
      c.mensagemRecebida === ""
        ? null
        : PEDIDO_DE_HUMANO.test(c.mensagemRecebida),
    avaliandoCandidato: true,
    posClassificacao: c.posClassificacao,
  };
}
