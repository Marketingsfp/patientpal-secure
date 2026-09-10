/**
 * FASE 2 — Camada semântica de agrupamento da timeline da conversa.
 *
 * NÃO é uma segunda timeline: é uma normalização pura (sem banco, sem rede)
 * sobre os MESMOS dados que a conversa já carrega — os eventos de
 * `atend_conversa_eventos` e os marcadores de sistema gravados em
 * `whatsapp_mensagens`. Nada é apagado nem reescrito: a saída apenas informa
 * quais registros pertencem ao mesmo processo, para a fase de renderização
 * mostrar um bloco no lugar de sete linhas.
 *
 * Regras invioláveis:
 *  - o agrupamento usa identificadores reais (`handoff_event_id`,
 *    `protocol_number`, `para_user_id`, `user_id`), nunca só texto;
 *  - eventos de handoffs diferentes nunca entram no mesmo grupo;
 *  - mensagem real de paciente/Nina/atendente jamais é agrupada — só entram
 *    marcadores de sistema conhecidos (`enviada_por: "sistema"`);
 *  - histórico antigo sem identificadores só é agrupado dentro de uma janela
 *    curta e delimitada pelo próximo handoff; na dúvida, fica separado.
 */

export type EventoTimeline = {
  id: string;
  evento: string;
  user_id?: string | null;
  motivo?: string | null;
  detalhes?: Record<string, unknown> | null;
  created_at: string;
  user_nome?: string | null;
  para_nome?: string | null;
  de_nome?: string | null;
};

export type MarcadorSistemaTimeline = {
  id: string;
  body: string | null;
  created_at: string;
  /** Só `"sistema"` pode ser absorvido; qualquer outro valor é mensagem real. */
  enviada_por?: string | null;
  status?: string | null;
};

export type OrigemHandoff = "IA" | "SISTEMA" | "HUMANO";

export type GrupoHandoff = {
  tipo: "HANDOFF";
  chave: string;
  criadoEm: string;
  motivo: string | null;
  urgencia: string | null;
  protocolo: string | null;
  filaInicial: number | null;
  origem: OrigemHandoff | null;
  status: "SOLICITADO" | "NA_FILA" | "PROTOCOLO_GERADO" | "PROTOCOLO_INFORMADO";
  auditoria: { registrada: boolean; completa: boolean | null; faltando: string[] };
  eventoIds: string[];
  marcadorIds: string[];
};

export type GrupoAtribuicao = {
  tipo: "ATRIBUICAO";
  chave: string;
  criadoEm: string;
  atendenteUserId: string | null;
  atendenteNome: string | null;
  automatica: boolean;
  criterio: string | null;
  statusAtendente: string | null;
  transferencia: boolean;
  origemNome: string | null;
  /** Quem executou a transferência manual (autor da ação). */
  realizadaPorNome: string | null;
  setorNome: string | null;
  eventoIds: string[];
  marcadorIds: string[];
};

export type ItemEventoSimples = {
  tipo: "EVENTO";
  chave: string;
  criadoEm: string;
  evento: EventoTimeline;
  /** Repetições idênticas absorvidas (ex.: mesmo resumo gravado N vezes). */
  repetidos: string[];
};

export type ItemTimelineAgrupado = GrupoHandoff | GrupoAtribuicao | ItemEventoSimples;

export type ResultadoAgrupamento = {
  itens: ItemTimelineAgrupado[];
  /** eventoId -> chave do item que o representa. */
  eventoParaItem: Map<string, string>;
  /** id da mensagem de sistema -> chave do grupo que já a representa. */
  marcadorParaItem: Map<string, string>;
};

/** Janela usada só quando NÃO há identificador explícito (histórico antigo). */
export const JANELA_HANDOFF_MS = 120_000;
export const JANELA_ATRIBUICAO_MS = 120_000;

const PREFIXO_TRANSFERENCIA = "🔁 Conversa transferida da Nina para atendimento humano";
const PREFIXO_HANDOFF_PROTOCOLO = "🧾 Handoff realizado pela Nina";
const PREFIXO_ATRIBUICAO_AUTO = "👤 Atribuída automaticamente a";
const PREFIXO_ENCAMINHADA = "Conversa encaminhada e atribuída a";

const ms = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

const det = (e: EventoTimeline): Record<string, unknown> => e.detalhes ?? {};

const txt = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

const normalizarNome = (v: string | null | undefined) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/** Protocolo oficial MJ-* citado no texto de um marcador de sistema. */
export function protocoloDoTexto(texto: string | null | undefined): string | null {
  return /\b(MJ-[A-Za-z0-9._-]+)/.exec(texto ?? "")?.[1] ?? null;
}

export function ehMarcadorSistema(m: MarcadorSistemaTimeline): boolean {
  return (m.enviada_por ?? "").toLowerCase() === "sistema" || (m.status ?? "") === "system";
}

/** Evento gerado pelo módulo de protocolo (não é o pedido de handoff em si). */
function ehEventoProtocolo(e: EventoTimeline): boolean {
  const d = det(e);
  return Boolean(txt(d["protocol_number"])) || /^Protocolo\s+\S+\s+(gerado|informado)/.test(e.motivo ?? "");
}

function ehProtocoloInformado(e: EventoTimeline): boolean {
  return e.evento === "ASSUMIDA" && (det(e)["protocolo_informado"] === true || ehEventoProtocolo(e));
}

/** Pedido de handoff propriamente dito — âncora de um grupo. */
function ehAncoraHandoff(e: EventoTimeline): boolean {
  return e.evento === "HANDOFF_SOLICITADO" && !ehEventoProtocolo(e);
}

function origemHandoff(e: EventoTimeline): OrigemHandoff | null {
  const v = txt(det(e)["solicitado_por"]);
  if (!v) return e.user_id ? "HUMANO" : null;
  const up = v.toUpperCase();
  if (up === "IA" || up === "NINA") return "IA";
  if (up === "SISTEMA") return "SISTEMA";
  return "HUMANO";
}

type GrupoHandoffInterno = GrupoHandoff & { fimMs: number };

/**
 * Agrupa eventos e marcadores de sistema em blocos operacionais.
 * Função pura e determinística: mesma entrada, mesma saída.
 */
export function agruparTimeline(entrada: {
  eventos: EventoTimeline[];
  marcadores?: MarcadorSistemaTimeline[];
}): ResultadoAgrupamento {
  const eventos = [...entrada.eventos].sort(
    (a, b) => ms(a.created_at) - ms(b.created_at) || a.id.localeCompare(b.id),
  );
  const marcadores = (entrada.marcadores ?? [])
    .filter(ehMarcadorSistema)
    .sort((a, b) => ms(a.created_at) - ms(b.created_at) || a.id.localeCompare(b.id));

  const itens: ItemTimelineAgrupado[] = [];
  const eventoParaItem = new Map<string, string>();
  const marcadorParaItem = new Map<string, string>();

  const gruposHandoff: GrupoHandoffInterno[] = [];
  const gruposAtribuicao: (GrupoAtribuicao & { fimMs: number })[] = [];

  const registrar = (item: ItemTimelineAgrupado) => {
    itens.push(item);
    return item;
  };

  const ancoras = eventos.filter(ehAncoraHandoff);
  const proximaAncoraMs = (depoisDe: number) =>
    ancoras.find((a) => ms(a.created_at) > depoisDe)?.created_at;

  /** Grupo de handoff dono deste evento — só por identificador ou janela segura. */
  function grupoHandoffDe(e: EventoTimeline, permitirJanela: boolean): GrupoHandoffInterno | null {
    const d = det(e);
    const handoffId = txt(d["handoff_event_id"]);
    if (handoffId) return gruposHandoff.find((g) => g.chave === handoffId) ?? null;
    const protocolo = txt(d["protocol_number"]);
    if (protocolo) {
      const porProtocolo = gruposHandoff.find((g) => g.protocolo === protocolo);
      if (porProtocolo) return porProtocolo;
      // Protocolo conhecido que não bate com nenhum grupo: não inventa vínculo.
      if (gruposHandoff.some((g) => g.protocolo && g.protocolo !== protocolo)) return null;
    }
    if (!permitirJanela) return null;
    return grupoPorJanela(e.created_at);
  }

  /** Fallback do histórico antigo: último handoff aberto, dentro da janela. */
  function grupoPorJanela(criadoEm: string): GrupoHandoffInterno | null {
    const t = ms(criadoEm);
    for (let i = gruposHandoff.length - 1; i >= 0; i -= 1) {
      const g = gruposHandoff[i]!;
      if (t < ms(g.criadoEm)) continue;
      if (t - ms(g.criadoEm) > JANELA_HANDOFF_MS) return null;
      const proxima = proximaAncoraMs(ms(g.criadoEm));
      if (proxima && t >= ms(proxima)) return null; // já é outro handoff
      return g;
    }
    return null;
  }

  for (const e of eventos) {
    // ---------- Grupo 1: handoff ----------
    if (ehAncoraHandoff(e)) {
      const d = det(e);
      const g: GrupoHandoffInterno = {
        tipo: "HANDOFF",
        chave: e.id,
        criadoEm: e.created_at,
        motivo: txt(e.motivo),
        urgencia: txt(d["urgencia"]),
        protocolo: null,
        filaInicial: null,
        origem: origemHandoff(e),
        status: "SOLICITADO",
        auditoria: { registrada: false, completa: null, faltando: [] },
        eventoIds: [e.id],
        marcadorIds: [],
        fimMs: ms(e.created_at),
      };
      gruposHandoff.push(g);
      eventoParaItem.set(e.id, g.chave);
      registrar(g);
      continue;
    }

    if (e.evento === "HANDOFF_SOLICITADO" && ehEventoProtocolo(e)) {
      const g = grupoHandoffDe(e, true);
      if (g) {
        g.protocolo = txt(det(e)["protocol_number"]) ?? g.protocolo;
        g.status = "PROTOCOLO_GERADO";
        g.eventoIds.push(e.id);
        g.fimMs = ms(e.created_at);
        eventoParaItem.set(e.id, g.chave);
        continue;
      }
    }

    if (e.evento === "ENTROU_NA_FILA") {
      const g = grupoHandoffDe(e, true);
      if (g) {
        const p = det(e)["posicao"];
        g.filaInicial = typeof p === "number" ? p : g.filaInicial;
        if (g.status === "SOLICITADO") g.status = "NA_FILA";
        g.eventoIds.push(e.id);
        g.fimMs = ms(e.created_at);
        eventoParaItem.set(e.id, g.chave);
        continue;
      }
    }

    if (ehProtocoloInformado(e)) {
      const g = grupoHandoffDe(e, false);
      if (g) {
        g.protocolo = txt(det(e)["protocol_number"]) ?? g.protocolo;
        g.status = "PROTOCOLO_INFORMADO";
        g.eventoIds.push(e.id);
        g.fimMs = ms(e.created_at);
        eventoParaItem.set(e.id, g.chave);
        continue;
      }
    }

    if (e.evento === "HANDOFF_AUDITORIA") {
      const d = det(e);
      const g = grupoHandoffDe(e, true);
      if (g) {
        g.protocolo = txt(d["protocol_number"]) ?? g.protocolo;
        g.auditoria = {
          registrada: true,
          completa: typeof d["auditoria_completa"] === "boolean" ? d["auditoria_completa"] : null,
          faltando: Array.isArray(d["auditoria_faltando"])
            ? (d["auditoria_faltando"] as unknown[]).filter((v): v is string => typeof v === "string")
            : [],
        };
        g.eventoIds.push(e.id);
        g.fimMs = ms(e.created_at);
        eventoParaItem.set(e.id, g.chave);
        continue;
      }
    }

    // ---------- Grupo 2: atribuição ----------
    if (e.evento === "ASSUMIDA" || e.evento === "TRANSFERIDA") {
      const d = det(e);
      const destinoId = txt(d["para_user_id"]) ?? txt(e.user_id);
      const destinoNome = txt(e.para_nome) ?? txt(e.user_nome);
      const t = ms(e.created_at);
      const existente = gruposAtribuicao.find(
        (g) =>
          t - g.fimMs <= JANELA_ATRIBUICAO_MS &&
          ((destinoId && g.atendenteUserId === destinoId) ||
            (!destinoId &&
              !!destinoNome &&
              normalizarNome(g.atendenteNome) === normalizarNome(destinoNome))),
      );
      if (existente) {
        existente.eventoIds.push(e.id);
        existente.criterio = existente.criterio ?? txt(e.motivo);
        existente.fimMs = t;
        eventoParaItem.set(e.id, existente.chave);
        continue;
      }
      const g: GrupoAtribuicao & { fimMs: number } = {
        tipo: "ATRIBUICAO",
        chave: e.id,
        criadoEm: e.created_at,
        atendenteUserId: destinoId,
        atendenteNome: destinoNome,
        automatica: d["manual"] !== true,
        criterio: txt(e.motivo) ?? txt(d["metodo"]),
        statusAtendente: txt(d["status_atendente"]) ?? txt(d["perfil"]),
        transferencia: e.evento === "TRANSFERIDA",
        origemNome: txt(e.de_nome),
        realizadaPorNome: e.evento === "TRANSFERIDA" ? txt(e.user_nome) : null,
        setorNome: txt(d["setor_nome"]),
        eventoIds: [e.id],
        marcadorIds: [],
        fimMs: t,
      };
      gruposAtribuicao.push(g);
      eventoParaItem.set(e.id, g.chave);
      registrar(g);
      continue;
    }

    // ---------- Repetições idênticas do mesmo evento ----------
    const anterior = itens[itens.length - 1];
    if (
      anterior?.tipo === "EVENTO" &&
      anterior.evento.evento === e.evento &&
      JSON.stringify(anterior.evento.detalhes ?? null) === JSON.stringify(e.detalhes ?? null) &&
      (anterior.evento.motivo ?? null) === (e.motivo ?? null)
    ) {
      anterior.repetidos.push(e.id);
      eventoParaItem.set(e.id, anterior.chave);
      continue;
    }

    const item: ItemEventoSimples = {
      tipo: "EVENTO",
      chave: e.id,
      criadoEm: e.created_at,
      evento: e,
      repetidos: [],
    };
    eventoParaItem.set(e.id, item.chave);
    registrar(item);
  }

  // ---------- Marcadores de sistema ----------
  for (const m of marcadores) {
    const corpo = (m.body ?? "").trimStart();
    const t = ms(m.created_at);

    if (corpo.startsWith(PREFIXO_HANDOFF_PROTOCOLO) || corpo.startsWith(PREFIXO_TRANSFERENCIA)) {
      const protocolo = protocoloDoTexto(corpo);
      const alvo =
        (protocolo ? gruposHandoff.find((g) => g.protocolo === protocolo) : undefined) ??
        (protocolo
          ? undefined
          : gruposHandoff
              .slice()
              .reverse()
              .find(
                (g) =>
                  t >= ms(g.criadoEm) &&
                  t - ms(g.criadoEm) <= JANELA_HANDOFF_MS &&
                  (() => {
                    const prox = proximaAncoraMs(ms(g.criadoEm));
                    return !prox || t < ms(prox);
                  })(),
              ));
      if (alvo) {
        alvo.marcadorIds.push(m.id);
        marcadorParaItem.set(m.id, alvo.chave);
      }
      continue;
    }

    if (corpo.startsWith(PREFIXO_ATRIBUICAO_AUTO) || corpo.startsWith(PREFIXO_ENCAMINHADA)) {
      const nome = normalizarNome(
        corpo
          .replace(PREFIXO_ATRIBUICAO_AUTO, "")
          .replace(PREFIXO_ENCAMINHADA, "")
          .replace(/\(online\)\.?/i, "")
          .replace(/\.\s*A IA parou de responder\.?/i, "")
          .replace(/[.\s]+$/, ""),
      );
      const online = /\(online\)/i.test(corpo);
      const alvo = gruposAtribuicao.find(
        (g) =>
          Math.abs(t - ms(g.criadoEm)) <= JANELA_ATRIBUICAO_MS &&
          !!nome &&
          normalizarNome(g.atendenteNome) === nome,
      );
      if (alvo) {
        alvo.marcadorIds.push(m.id);
        if (!alvo.statusAtendente && online) alvo.statusAtendente = "ONLINE";
        marcadorParaItem.set(m.id, alvo.chave);
      }
      continue;
    }
    // Qualquer outro texto é mensagem real ou aviso próprio: nunca agrupado.
  }

  const limpos: ItemTimelineAgrupado[] = itens.map((i) =>
    i.tipo === "HANDOFF" || i.tipo === "ATRIBUICAO"
      ? ({ ...i, fimMs: undefined } as unknown as ItemTimelineAgrupado)
      : i,
  );
  for (const i of limpos) delete (i as Record<string, unknown>)["fimMs"];

  return { itens: limpos, eventoParaItem, marcadorParaItem };
}
