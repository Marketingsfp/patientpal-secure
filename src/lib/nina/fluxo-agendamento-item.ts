/**
 * Fluxo de atendimento por item do catálogo (regra de 12/10/2026).
 *
 *  - agendar: modalidade hora marcada, ordem de chegada COM pré-agendamento ou
 *    ficha, e "Nina pode agendar" marcado → saudação → informações →
 *    disponibilidade → dados → agendamento.
 *  - informar_e_encaminhar: "Nina não pode agendar" ou modalidade não informada →
 *    saudação → informações → encaminha à equipe só quando o paciente quer
 *    marcar, nunca antes de informar. Se a intenção chega antes das
 *    informações, a Nina informa e pergunta se pode encaminhar.
 *  - somente_informar: ordem de chegada SEM pré-agendamento → tira dúvidas e
 *    orienta a comparecer, sem encaminhar (vale só a regra dos 30 minutos).
 *
 * Módulo puro: sem banco e sem rede.
 */
import { atendimentosDaEstrutura, lerEstrutura } from "./catalogo-estrutura";
import { interpretarModalidade, type ModalidadeResolvida } from "./modalidade-atendimento";
import { normalizarRespostaInformal, ehRespostaAfirmativaCurta } from "./resposta-afirmativa";

export type FluxoItem = "agendar" | "informar_e_encaminhar" | "somente_informar";

export const PERGUNTA_ENCAMINHAMENTO =
  "Posso encaminhar para nossa equipe confirmar o seu horário?";

const MODALIDADES_AGENDAVEIS = new Set<ModalidadeResolvida>([
  "hora_marcada",
  "chegada_com_pre_agendamento",
  "ficha",
]);

/** Modalidade do item pelos blocos de atendimento; a classificação antiga só completa. */
export function modalidadeDoRegistro(registro: {
  estrutura?: unknown;
  tipo_atendimento?: string | null;
}): ModalidadeResolvida {
  // Item estruturado: a modalidade de cada atendimento é a única fonte. Todos
  // precisam ter a mesma; faltando em algum, o item fica sem modalidade.
  const estruturados = atendimentosDaEstrutura(registro.estrutura);
  if (estruturados) {
    const modos = new Set(estruturados.map((a) => a.modalidade ?? null));
    const unica = modos.size === 1 ? [...modos][0] : null;
    return unica ?? "nao_definida";
  }
  const modos = lerEstrutura(registro.estrutura)
    .complementos.map((c) => c.modalidade)
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  if (modos.length) return new Set(modos).size === 1 ? modos[0]! : "nao_definida";
  return interpretarModalidade(registro.tipo_atendimento) ?? "nao_definida";
}

export function fluxoDoItem(item: {
  modalidade: ModalidadeResolvida | null | undefined;
  ninaPodeAgendar: boolean;
  /** Agenda da clínica disponível neste turno; sem ela nenhum item é agendado. */
  clinicaPodeAgendar?: boolean;
}): FluxoItem {
  if (item.modalidade === "chegada_sem_pre_agendamento") return "somente_informar";
  if (
    item.clinicaPodeAgendar !== false &&
    item.ninaPodeAgendar &&
    item.modalidade &&
    MODALIDADES_AGENDAVEIS.has(item.modalidade)
  )
    return "agendar";
  return "informar_e_encaminhar";
}

export function fluxoDoRegistro(
  registro: { estrutura?: unknown; tipo_atendimento?: string | null },
  clinicaPodeAgendar = true,
): FluxoItem {
  return fluxoDoItem({
    modalidade: modalidadeDoRegistro(registro),
    ninaPodeAgendar: lerEstrutura(registro.estrutura).nina_pode_agendar === true,
    clinicaPodeAgendar,
  });
}

/**
 * Tira do fim do texto da IA a pergunta sobre marcar, primeiro horário ou
 * escolha de profissional, para a pergunta de encaminhamento ser a única.
 */
export function removerPerguntaDeAgendamento(texto: string): string {
  const blocos = texto.trimEnd().split(/\n{2,}/);
  const assunto =
    /(primeir[oa] (?:horario|vaga|disponivel)|escolher|qual (?:dos|das|desses|dessas) profissiona|profissional prefere|deseja (?:agendar|marcar)|quer (?:agendar|marcar)|gostaria de (?:agendar|marcar)|disponibilidade|encaminh|posso (?:agendar|marcar|verificar))/;
  // Oferta de transferência escrita como afirmação ("posso transferir a
  // conversa…."): seria uma segunda oferta ao lado da pergunta do sistema.
  const ofertaAfirmada =
    /\b(?:posso|vou|irei|podemos|vamos)\s+(?:te\s+|lhe\s+)?(?:transferir|encaminhar|passar|direcionar)\b|\b(?:nossa equipe|a equipe|um atendente|atendente)\b.*\b(?:verificar|confirmar|concluir|dar continuidade)\b/;
  // Remove só perguntas ou ofertas finais sobre marcar; nunca esvazia a resposta.
  // Corta só o trecho final; quebras de linha do resto ficam intactas.
  for (;;) {
    const ultimo = blocos[blocos.length - 1]!;
    const final = /([^.!?\n]*[.!?])\s*$/.exec(ultimo);
    if (!final) break;
    const frase = normalizarRespostaInformal(final[1]!);
    const remover = final[1]!.endsWith("?") ? assunto.test(frase) : ofertaAfirmada.test(frase);
    if (!remover) break;
    const resto = ultimo.slice(0, final.index).trimEnd();
    if (resto) {
      blocos[blocos.length - 1] = resto;
      continue;
    }
    if (blocos.length === 1) break;
    blocos.pop();
  }
  return blocos.join("\n\n");
}

/** Fluxo comum aos itens em discussão; itens com fluxos diferentes = indefinido. */
export function fluxoDosItens(fluxos: readonly FluxoItem[]): FluxoItem | null {
  if (!fluxos.length) return null;
  return new Set(fluxos).size === 1 ? fluxos[0]! : null;
}

/** Resposta do paciente à pergunta "Posso encaminhar…?". */
export function respostaAOferta(texto: string): "aceite" | "recusa" | null {
  const t = normalizarRespostaInformal(texto ?? "");
  if (!t) return null;
  if (
    /^(?:nao|agora nao|nao obrigad[oa]|so (?:queria|era) (?:saber|informacao|informacoes)|so (?:informacao|informacoes)|depois|mais tarde)\b/.test(
      t,
    )
  )
    return "recusa";
  if (
    ehRespostaAfirmativaCurta(texto) ||
    /^(?:pode|pode sim|pode encaminhar|pode sim por favor|sim pode|quero|quero sim|quero marcar|quero agendar|gostaria|gostaria sim|por favor|sim por favor|encaminha|encaminhe)$/.test(
      t,
    )
  )
    return "aceite";
  // Resposta longa (ex.: dados do paciente junto do "pode encaminhar sim").
  // Recusa explícita do encaminhamento prevalece sobre qualquer "sim".
  if (
    /\bnao\s+(?:precisa|quero|pode|precisa(?:r)? de)\s+(?:me\s+)?(?:encaminhar|transferir|passar|marcar|agendar)\b|\bnao\s+(?:me\s+)?(?:encaminh|transfir|transfer)/.test(
      t,
    )
  )
    return "recusa";
  if (
    /\b(?:pode|podem|sim|pode sim|sim pode)\s+(?:me\s+)?(?:encaminhar|transferir|passar|mandar|encaminha|encaminhe|transfere|transfira)\b|\b(?:encaminh(?:a|e|ar)|transfer(?:e|ir)|transfira)\s+sim\b|\b(?:pode sim|sim pode|pode sim por favor)\b|\bquero (?:sim|marcar|agendar)\b|\bpode (?:marcar|agendar)\b/.test(
      t,
    )
  )
    return "aceite";
  return null;
}

export type OfertaEncaminhamento = {
  session_id: string;
  referencias: string[];
  em: string;
};

/**
 * Decisão do turno para a intenção de agendar.
 *  - encaminhar: a equipe assume agora (informações já entregues).
 *  - oferecer_apos_informar: a Nina informa e o sistema acrescenta a pergunta.
 *  - seguir: fluxo normal (dúvidas, ordem de chegada ou agendamento pela Nina).
 */
export function decidirAgendamentoNoTurno(p: {
  intencaoAgendar: boolean;
  fluxo: FluxoItem | null;
  informacoesEntregues: boolean;
  ofertaPendente: boolean;
  respostaOferta: "aceite" | "recusa" | null;
}): "encaminhar" | "oferecer_apos_informar" | "seguir" {
  if (p.ofertaPendente && p.respostaOferta === "aceite") return "encaminhar";
  if (p.ofertaPendente && p.respostaOferta === "recusa") return "seguir";
  if (!p.intencaoAgendar) return "seguir";
  if (p.fluxo === "informar_e_encaminhar")
    return p.informacoesEntregues ? "encaminhar" : "oferecer_apos_informar";
  return "seguir";
}

/** Motivo de transferência pedido pela IA que trata de marcar horário (não cancela/remarca). */
export function motivoEhEncaminhamentoDeAgendamento(motivo: string): boolean {
  const t = normalizarRespostaInformal(motivo ?? "");
  // Causas operacionais e encaminhamentos obrigatórios nunca são adiados.
  if (
    /cancel|remarc|reagend|indisponiv|sem vaga|falha|erro|sfp|lista|urgen|obrigatori|privacidade|cartao/.test(
      t,
    )
  )
    return false;
  return (
    /agendamento_transicao/.test(t) ||
    /\b(?:deseja|quer|querendo|gostaria de|interesse em|pediu para|solicitou)\s+(?:agendar|marcar)\b/.test(
      t,
    )
  );
}
