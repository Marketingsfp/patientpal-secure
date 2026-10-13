/**
 * Fluxo de atendimento por item do catálogo (regra de 12/10/2026).
 *
 *  - agendar: modalidade hora marcada, ordem de chegada COM pré-agendamento ou
 *    ficha, e "Nina pode agendar" marcado → saudação → informações →
 *    disponibilidade → dados → agendamento.
 *  - informar_e_encaminhar: "Nina não pode agendar" ou modalidade não informada →
 *    saudação → informações → encaminha à equipe só quando o paciente quer
 *    marcar, nunca antes de informar. A mensagem de informações não pergunta
 *    se pode encaminhar (13/10/2026): a Nina espera a resposta, e a escolha de
 *    dia, horário ou profissional encaminha.
 *  - somente_informar: ordem de chegada SEM pré-agendamento → tira dúvidas e
 *    orienta a comparecer, sem encaminhar (vale só a regra dos 30 minutos).
 *
 * Módulo puro: sem banco e sem rede.
 */
import {
  atendimentosDaEstrutura,
  atendimentosEstruturados,
  lerEstrutura,
  modalidadeEstruturada,
} from "./catalogo-estrutura";
import {
  selecionarAtendimentosConsulta,
  type EscopoAtendimentoConsulta,
} from "./atendimento-consulta";
import { interpretarModalidade, type ModalidadeResolvida } from "./modalidade-atendimento";
import { normalizarRespostaInformal, ehRespostaAfirmativaCurta } from "./resposta-afirmativa";
import { PERGUNTA_PREFERENCIA_PROFISSIONAL } from "./prompt/consulta-agenda";

/**
 * Pergunta de preferência no modelo de 13/10/2026: a última pergunta da IA
 * sobre preferência de profissional, médico ou primeiro disponível vira
 * "Você tem preferência por algum profissional ou gostaria de marcar com o
 * primeiro disponível?" (sem emoji). Outras perguntas ficam como estão.
 */
export function padronizarPerguntaPreferencia(texto: string): string {
  const protegido = protegerAbreviacoes(texto.trimEnd());
  const final = /([^.!?\n]*\?)[^\p{L}\p{N}\n]*$/u.exec(protegido);
  if (!final) return texto;
  const frase = normalizarRespostaInformal(restaurarAbreviacoes(final[1]!));
  if (
    !/\bprefer/.test(frase) ||
    !/(?:profissiona|medic|doutor|primeiro (?:horario )?disponivel|primeira vaga)/.test(frase)
  )
    return texto;
  const antes = protegido.slice(0, final.index);
  const separador = antes && !/\s$/.test(antes) ? " " : "";
  return restaurarAbreviacoes(`${antes}${separador}${PERGUNTA_PREFERENCIA_PROFISSIONAL}`);
}

export type FluxoItem = "agendar" | "informar_e_encaminhar" | "somente_informar";

export const PERGUNTA_ENCAMINHAMENTO =
  "Posso encaminhar para nossa equipe confirmar o seu horário?";

const MODALIDADES_AGENDAVEIS = new Set<ModalidadeResolvida>([
  "hora_marcada",
  "chegada_com_pre_agendamento",
  "ficha",
]);

/**
 * Modalidade do item pelos blocos de atendimento; a classificação antiga só completa.
 * Item estruturado (regra de 12/10/2026): cada atendimento vale por si.
 *  - Com o atendimento pedido identificado (`escopo`), vale a modalidade dele,
 *    isoladamente (consulta, revisão, noturna, atestado, laudos…).
 *  - Sem identificação, vale a modalidade comum aos atendimentos que a têm;
 *    atendimento sem modalidade não bloqueia os demais.
 */
export function modalidadeDoRegistro(
  registro: {
    estrutura?: unknown;
    tipo_atendimento?: string | null;
    nome?: string | null;
  },
  escopo?: EscopoAtendimentoConsulta | null,
): ModalidadeResolvida {
  const estruturados = atendimentosDaEstrutura(registro.estrutura);
  if (estruturados) {
    if (escopo?.atendimento?.trim()) {
      const itens = atendimentosEstruturados("", registro.estrutura, registro.nome ?? undefined);
      const selecionados = selecionarAtendimentosConsulta(itens, escopo);
      if (selecionados.length)
        return (
          modalidadeEstruturada("", registro.estrutura, registro.nome ?? "", null, selecionados) ??
          "nao_definida"
        );
    }
    const modos = new Set(
      estruturados.map((a) => a.modalidade).filter((m): m is NonNullable<typeof m> => Boolean(m)),
    );
    return modos.size === 1 ? [...modos][0]! : "nao_definida";
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
  registro: { estrutura?: unknown; tipo_atendimento?: string | null; nome?: string | null },
  clinicaPodeAgendar = true,
  escopo?: EscopoAtendimentoConsulta | null,
): FluxoItem {
  return fluxoDoItem({
    modalidade: modalidadeDoRegistro(registro, escopo),
    ninaPodeAgendar: lerEstrutura(registro.estrutura).nina_pode_agendar === true,
    clinicaPodeAgendar,
  });
}

/** Marca temporária do ponto de "Dra." e afins, que não termina a frase. */
const PONTO_ABREVIACAO = String.fromCharCode(30);
function protegerAbreviacoes(texto: string): string {
  return texto.replace(/\b(?:dra?|sra?|profa?)\./gi, (m) => m.slice(0, -1) + PONTO_ABREVIACAO);
}
function restaurarAbreviacoes(texto: string): string {
  return texto.split(PONTO_ABREVIACAO).join(".");
}

/**
 * Tira do fim do texto da IA a pergunta sobre marcar, primeiro horário ou
 * escolha de profissional, para a pergunta de encaminhamento ser a única.
 */
export function removerPerguntaDeAgendamento(texto: string): string {
  const blocos = protegerAbreviacoes(texto.trimEnd()).split(/\n{2,}/);
  const assunto =
    /(primeir[oa] (?:horario|vaga|disponivel)|escolher|qual (?:dos|das|desses|dessas) profissiona|profissional prefere|deseja (?:agendar|marcar)|quer (?:agendar|marcar)|gostaria de (?:agendar|marcar)|disponibilidade|encaminh|transfer|posso (?:agendar|marcar|verificar))/;
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
  return restaurarAbreviacoes(blocos.join("\n\n"));
}

/**
 * Mensagem de informações não oferece transferência (regra de 13/10/2026): tira
 * do fim do texto só a pergunta ou oferta de encaminhar/transferir à equipe. As
 * demais perguntas (ex.: preferência de profissional ou dia) continuam.
 */
export function removerOfertaDeEncaminhamento(texto: string): string {
  const blocos = protegerAbreviacoes(texto.trimEnd()).split(/\n{2,}/);
  const oferta =
    /\b(?:encaminh|transfer|direcion)\w*|\b(?:nossa equipe|a equipe|um atendente|atendente|setor)\b.*\b(?:verificar|confirmar|concluir|dar continuidade|agendar|marcar)\b/;
  for (;;) {
    const ultimo = blocos[blocos.length - 1]!;
    const final = /([^.!?\n]*[.!?])\s*$/.exec(ultimo);
    if (!final) break;
    const frase = normalizarRespostaInformal(final[1]!);
    if (
      !oferta.test(frase) ||
      !/\b(?:posso|podemos|deseja|quer|gostaria|vou|vamos|irei|devo)\b/.test(frase)
    )
      break;
    const resto = ultimo.slice(0, final.index).trimEnd();
    if (resto) {
      blocos[blocos.length - 1] = resto;
      continue;
    }
    if (blocos.length === 1) break;
    blocos.pop();
  }
  return restaurarAbreviacoes(blocos.join("\n\n"));
}

/**
 * A IA afirma que a conversa vai para a equipe ("nossa equipe vai dar
 * continuidade", "aguarde que logo você será atendido"). Sem transferência
 * real, isso é uma promessa falsa.
 */
export function afirmaEncaminhamento(texto: string): boolean {
  const t = normalizarRespostaInformal(texto ?? "");
  return /\b(?:vou|irei|vamos)\s+(?:te\s+|lhe\s+)?(?:encaminhar|transferir|passar|direcionar)\b(?![^.!?\n]*\?)|\b(?:encaminhei|transferi|direcionei)\b|\b(?:nossa equipe|a equipe|um atendente|uma atendente|atendente)\b[^.!?\n]*\b(?:vai|ira|vao|irao)\s+(?:dar continuidade|continuar|verificar|confirmar|entrar em contato|te atender|atender)|\baguarde\b[^.!?\n]*\b(?:atendid|atendente|equipe)/.test(
    t,
  );
}

const DIAS_DA_SEMANA =
  /\b(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:[- ]feira)?s?\b|\bamanha\b|\bhoje\b/;
const ESCOLHA =
  /\b(?:pode deixar|pode ser|fica bom|fica boa|ficaria bom|ficaria boa|serve|da pra mim|pra mim (?:da|serve|fica)|quero (?:marcar|agendar|com|esse|essa|na|no|sim)|vou querer|prefiro|pode marcar|pode agendar|pode confirmar|combinado|fechado|melhor pra mim)\b/;
/** "O primeiro disponível", "qualquer um": escolha sem dia nem profissional. */
const SEM_PREFERENCIA =
  /\b(?:primeiro (?:horario |)disponivel|primeiro horario|primeira vaga|qualquer um|qualquer uma|qualquer profissional|tanto faz|quem tiver primeiro|o que tiver primeiro)\b/;

/**
 * Depois das informações, o paciente escolhe dia, horário ou profissional
 * ("quinta com a Dra. X fica boa pra mim", "pode deixar pra quinta"): é o
 * pedido de marcar. `nomes` são os profissionais/itens informados na conversa.
 */
export function escolhaParaAgendar(mensagem: string, nomes: readonly string[] = []): boolean {
  const t = normalizarRespostaInformal(mensagem ?? "");
  if (!t) return false;
  const citaProfissional = nomes.some((nome) =>
    normalizarRespostaInformal(nome)
      .split(/\s+/)
      .filter((p) => p.length >= 4 && !/^(?:consulta|exame|doutor|doutora)$/.test(p))
      .some((p) => new RegExp(`\\b${p}\\b`).test(t)),
  );
  if (SEM_PREFERENCIA.test(t) && !mensagem.includes("?")) return true;
  const citaQuando = DIAS_DA_SEMANA.test(t) || /\b\d{1,2}\s*(?:h|horas?|:\d{2})\b/.test(t);
  if (ESCOLHA.test(t) && (citaQuando || citaProfissional || /\b(?:marcar|agendar)\b/.test(t)))
    return true;
  // Resposta curta só com o dia, o horário ou o nome ("quinta às 10h", "com a Valeria").
  return (citaQuando || citaProfissional) && !mensagem.includes("?") && t.split(/\s+/).length <= 6;
}

/** A resposta da IA termina com uma pergunta ou oferta própria sobre marcar ou encaminhar? */
export function terminaComOfertaDeAgendamento(texto: string): boolean {
  const original = texto.trimEnd();
  return Boolean(original) && removerPerguntaDeAgendamento(original) !== original;
}

const INTENCOES_DE_SEGUIMENTO = new Set(["agendamento", "disponibilidade", "medico", "horario"]);

/**
 * Intenção de agendar que vale para a sessão: depois que o paciente disse que
 * quer marcar, escolher o profissional ou o horário ("pode ser a Valeria",
 * "seria 9h") continua o agendamento. Pergunta nova não continua.
 */
export function intencaoDeAgendarNaSessao(p: {
  intencaoNoTurno: boolean;
  sessaoComIntencao: boolean;
  intencoesTurno: readonly string[];
  mensagem: string;
}): boolean {
  if (p.intencaoNoTurno) return true;
  if (!p.sessaoComIntencao) return false;
  if (!p.intencoesTurno.every((i) => INTENCOES_DE_SEGUIMENTO.has(i))) return false;
  const t = normalizarRespostaInformal(p.mensagem ?? "");
  if (
    !t ||
    /\?/.test(p.mensagem) ||
    /^(?:qual|quais|quanto|quantos|que horas|onde|como|quando|tem|voces tem|existe)\b/.test(t) ||
    // Despedida ou adiamento não é pedido de marcar.
    /\b(?:obrigad[oa]|valeu|so isso|era so|vou pensar|vou ver|depois eu|mais tarde|nao precisa|deixa pra la)\b/.test(
      t,
    )
  )
    return false;
  return true;
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
