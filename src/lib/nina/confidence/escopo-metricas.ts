/**
 * FASE 7 — escopo das métricas: o que é confiança da RESPOSTA e o que é
 * segurança da AÇÃO.
 *
 * O problema real: a mesma mensagem gera até dois registros — um avaliando o
 * texto (`answer_confidence`) e outro avaliando a ação pedida
 * (`action_safety`). Somando os dois na mesma média, uma mensagem com resposta
 * 98 e ação 20 aparecia como "duas mensagens de média 59". Nenhum dos dois
 * números existe: a resposta foi 98 e a ação foi 20, em uma mensagem só.
 *
 * Aqui a lista é separada por tipo de avaliação e deduplicada por SAÍDA (a
 * mensagem entregue), sem descartar registro nenhum do banco: o que sai daqui
 * é só o recorte usado para calcular cada indicador, e o que ficou de fora é
 * contado e declarado.
 */

export type LinhaComEscopo = {
  id: string;
  created_at?: string;
  ambiente?: string | null;
  avaliacao?: string | null;
  modo?: string | null;
  outgoing_message_id?: string | null;
  message_id?: string | null;
  execucao_id?: string | null;
  conversation_id?: string | null;
  policy_version?: string | null;
};

export const AVALIACAO_RESPOSTA = "answer_confidence";
export const AVALIACAO_ACAO = "action_safety";

/**
 * Identidade da saída avaliada. Do vínculo mais forte para o mais fraco:
 * mensagem persistida → mensagem → execução → o próprio registro.
 */
export function chaveSaida(l: LinhaComEscopo): string {
  if (l.outgoing_message_id) return `m:${l.outgoing_message_id}`;
  if (l.message_id) return `m:${l.message_id}`;
  if (l.execucao_id) return `e:${l.execucao_id}`;
  return `d:${l.id}`;
}

/**
 * Registros antigos podem não ter o tipo gravado. Eles são a avaliação da
 * resposta apenas quando não existe outro registro de resposta para a mesma
 * saída — nunca são "convertidos" em segurança da ação.
 */
function tipoDe(l: LinhaComEscopo): "resposta" | "acao" | "indefinido" {
  const v = String(l.avaliacao ?? "").toLowerCase();
  if (v === AVALIACAO_RESPOSTA) return "resposta";
  if (v === AVALIACAO_ACAO) return "acao";
  return "indefinido";
}

export type SeparacaoEscopo<T extends LinhaComEscopo> = {
  /** Uma linha por saída: a avaliação da resposta. */
  respostas: T[];
  /** Uma linha por saída: a avaliação de segurança da ação. */
  seguranca: T[];
  /** Registros sem tipo gravado, aproveitados como avaliação da resposta. */
  semTipo: number;
  /** Registros descartados por serem repetição da MESMA saída e mesmo tipo. */
  duplicadosDescartados: number;
  /** Saídas distintas presentes no recorte (denominador de "mensagens"). */
  saidas: number;
};

/**
 * Separa e deduplica. Quando a mesma saída tem mais de um registro do mesmo
 * tipo, vale o mais recente — o anterior não é apagado, apenas não é somado
 * duas vezes no mesmo indicador.
 */
export function separarAvaliacoes<T extends LinhaComEscopo>(linhas: T[]): SeparacaoEscopo<T> {
  const respostas = new Map<string, T>();
  const seguranca = new Map<string, T>();
  const indefinidos = new Map<string, T>();
  let duplicadosDescartados = 0;

  const guardar = (mapa: Map<string, T>, chave: string, l: T) => {
    const atual = mapa.get(chave);
    if (!atual) {
      mapa.set(chave, l);
      return;
    }
    duplicadosDescartados += 1;
    const a = Date.parse(String(atual.created_at ?? ""));
    const b = Date.parse(String(l.created_at ?? ""));
    if (!Number.isNaN(b) && (Number.isNaN(a) || b > a)) mapa.set(chave, l);
  };

  for (const l of linhas) {
    const chave = chaveSaida(l);
    const tipo = tipoDe(l);
    if (tipo === "resposta") guardar(respostas, chave, l);
    else if (tipo === "acao") guardar(seguranca, chave, l);
    else guardar(indefinidos, chave, l);
  }

  let semTipo = 0;
  for (const [chave, l] of indefinidos) {
    if (respostas.has(chave)) {
      duplicadosDescartados += 1;
      continue;
    }
    respostas.set(chave, l);
    semTipo += 1;
  }

  const saidas = new Set<string>([...respostas.keys(), ...seguranca.keys()]).size;
  return {
    respostas: [...respostas.values()],
    seguranca: [...seguranca.values()],
    semTipo,
    duplicadosDescartados,
    saidas,
  };
}

/**
 * Ambiente e versão da política mudam o que está sendo comparado. Quando o
 * recorte mistura mais de um, o painel avisa em vez de apresentar uma média
 * única como se fosse comparável.
 */
export type MisturaRecorte = {
  ambientes: string[];
  versoesPolitica: string[];
  comparavel: boolean;
};

export function descreverMistura(linhas: LinhaComEscopo[]): MisturaRecorte {
  const ambientes = [...new Set(linhas.map((l) => l.ambiente ?? "nao_registrado"))].sort();
  const versoesPolitica = [
    ...new Set(linhas.map((l) => l.policy_version ?? "nao_registrada")),
  ].sort();
  return {
    ambientes,
    versoesPolitica,
    comparavel: ambientes.length <= 1 && versoesPolitica.length <= 1,
  };
}
