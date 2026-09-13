/** Contrato único das fontes necessárias. Puro: nunca consulta nem executa ações. */
import { extrairClaimsDoTexto } from "./claims";
import { classificarNatureza, NATUREZAS_NAO_FACTUAIS } from "./modalidade";
import { afirmaOuPrometeAgendamento } from "../afirmacao-agendamento";
import type { ChaveFato } from "./evidencia";
import type { ContextoConfianca, TipoClaim } from "./types";

export type FonteExigida =
  | "catalogo_publicado"
  | "agenda"
  | "operacao_confirmada"
  | "catalogo_ou_instrucoes";
export type RequisitoFonte = {
  tipoClaim: TipoClaim;
  fonte: FonteExigida;
  trecho: string;
  chave: ChaveFato | null;
  origem: "texto" | "estruturado" | "acao" | "compatibilidade";
};

const FONTE_POR_CLAIM: Record<TipoClaim, FonteExigida> = {
  valor: "catalogo_publicado",
  profissional: "catalogo_publicado",
  escala: "catalogo_publicado",
  servico: "catalogo_publicado",
  convenio: "catalogo_publicado",
  preparo: "catalogo_publicado",
  disponibilidade: "agenda",
  agendamento: "operacao_confirmada",
  endereco: "catalogo_ou_instrucoes",
  unidade: "catalogo_ou_instrucoes",
  regra: "catalogo_ou_instrucoes",
  restricao: "catalogo_ou_instrucoes",
};
const CLAIM_POR_ACAO: Partial<Record<string, TipoClaim>> = {
  informar_valor: "valor",
  informar_profissional: "profissional",
  informar_horario: "escala",
  informar_disponibilidade: "disponibilidade",
  informar_preparo: "preparo",
  informar_regra: "regra",
  criar_agendamento: "agendamento",
  cancelar_agendamento: "agendamento",
};
const CLAIM_POR_CATEGORIA: Partial<Record<string, TipoClaim>> = {
  valor: "valor",
  profissional: "profissional",
  horario: "escala",
  disponibilidade: "disponibilidade",
  preparo: "preparo",
  regra: "regra",
  agendamento: "agendamento",
};

function descreveReserva(texto: string): boolean {
  if (/\b(?:vagas?|disponibilidade|livres?|encaixes?)\b/iu.test(texto)) return false;
  return (
    afirmaOuPrometeAgendamento(texto) ||
    /\b(?:seu|sua)\s+(?:agendamento|consulta|hor[áa]rio)\s+(?:segue|continua|permanece)\s+confirmad[oa]\b/iu.test(
      texto,
    )
  );
}

/** Reidratação pode buscar catálogo/agenda; prova de operação jamais autoriza uma escrita. */
export function requisitosDeFonte(
  ctx: ContextoConfianca,
  categorias: string[] = [],
): RequisitoFonte[] {
  const requisitos: RequisitoFonte[] = [];
  const vistos = new Set<string>();
  const adicionar = (
    tipoClaim: TipoClaim,
    trecho: string,
    chave: ChaveFato | null,
    origem: RequisitoFonte["origem"],
    frase = trecho,
  ) => {
    // O horário de uma reserva é comprovado pela operação. Isso não autoriza
    // afirmar vagas adicionais, que continuam exigindo consulta à agenda.
    const fonte =
      tipoClaim === "disponibilidade" && descreveReserva(frase)
        ? "operacao_confirmada"
        : FONTE_POR_CLAIM[tipoClaim];
    const id = JSON.stringify([tipoClaim, trecho, chave]);
    if (vistos.has(id)) return;
    vistos.add(id);
    requisitos.push({ tipoClaim, fonte, trecho, chave, origem });
  };
  for (const c of extrairClaimsDoTexto(ctx.draftText ?? "")) {
    if (c.modalidade === "pergunta" || NATUREZAS_NAO_FACTUAIS.has(c.natureza)) continue;
    adicionar(c.tipo, c.trecho, c.chave ?? null, "texto", c.frase);
  }
  for (const c of ctx.claims ?? []) {
    if (c.modalidade === "pergunta" || NATUREZAS_NAO_FACTUAIS.has(classificarNatureza(c.texto)))
      continue;
    adicionar(c.tipo, c.texto, c.chave ?? null, "estruturado");
  }
  if (
    afirmaOuPrometeAgendamento(ctx.draftText) &&
    !requisitos.some((r) => r.tipoClaim === "agendamento")
  ) {
    adicionar("agendamento", ctx.draftText ?? "", null, "texto");
  }
  // A mensagem final é julgada pelo que afirma, sem herdar pré-condição de ação pendente.
  if (ctx.tipoAvaliacao !== "answer_confidence" && ctx.requestedAction) {
    const tipo = CLAIM_POR_ACAO[ctx.requestedAction];
    if (tipo && !requisitos.some((r) => r.tipoClaim === tipo))
      adicionar(tipo, ctx.requestedAction, null, "acao");
  }
  // Compatibilidade para quem chama o validador antes de existir texto/claims.
  if (!(ctx.draftText ?? "").trim() && !ctx.claims?.length) {
    for (const categoria of categorias) {
      const tipo = CLAIM_POR_CATEGORIA[categoria];
      if (tipo && !requisitos.some((r) => r.tipoClaim === tipo))
        adicionar(tipo, categoria, null, "compatibilidade");
    }
  }
  return requisitos;
}

/** Prova de reserva é operação persistida + ID; um booleano de UI não basta. */
export function reservaComProva(ctx: ContextoConfianca): boolean {
  return (
    ctx.operationalState?.appointmentCreated === true &&
    Boolean(ctx.operationalState.appointmentId?.trim())
  );
}

/** Presença do canal oficial, não veracidade de cada valor (esta cabe ao grounding). */
export function fontesPresentes(ctx: ContextoConfianca): Record<FonteExigida, boolean> {
  const fonte = (tipo: "catalogo_publicado" | "agenda" | "instrucoes") =>
    ctx.retrievedSources.some(
      (s) =>
        s.tipo === tipo &&
        s.temConteudo &&
        s.publicado !== false &&
        s.ativo !== false &&
        s.interna !== true &&
        !s.substituidoPor,
    );
  const ferramenta = (capacidades: string[]) =>
    ctx.toolResults.some(
      (f) =>
        f.capacidade !== null &&
        capacidades.includes(f.capacidade) &&
        f.success &&
        !f.erro &&
        f.temConteudo === true,
    );
  const catalogo =
    fonte("catalogo_publicado") || ferramenta(["searchKnowledgeBase", "listCatalog"]);
  const agenda = fonte("agenda") || ferramenta(["checkAvailability", "listSlots"]);
  return {
    catalogo_publicado: catalogo,
    agenda,
    operacao_confirmada: reservaComProva(ctx),
    catalogo_ou_instrucoes: catalogo || fonte("instrucoes"),
  };
}
