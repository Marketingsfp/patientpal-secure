import { describe, expect, it } from "bun:test";
import {
  agruparTimeline,
  handoffsAguardandoAtendente,
  type EventoTimeline,
  type MarcadorSistemaTimeline,
} from "./timeline-grupos";

const base = Date.parse("2026-09-10T14:01:15.000Z");
const em = (segundos: number) => new Date(base + segundos * 1000).toISOString();

/** Sequência real medida em produção (conversa f15d…5796). */
function cenarioReal(): {
  eventos: EventoTimeline[];
  marcadores: MarcadorSistemaTimeline[];
} {
  const eventos: EventoTimeline[] = [
    {
      id: "h1",
      evento: "HANDOFF_SOLICITADO",
      created_at: em(0),
      motivo: "Sintoma de urgência cardíaca",
      detalhes: { urgencia: "alta", solicitado_por: "IA", resumo: "…" },
    },
    { id: "f1", evento: "ENTROU_NA_FILA", created_at: em(0.1), detalhes: { posicao: 4 } },
    {
      id: "p1",
      evento: "HANDOFF_SOLICITADO",
      created_at: em(0.2),
      motivo: "Protocolo MJ-5 gerado (handoff)",
      detalhes: {
        conversation_id: "c1",
        handoff_event_id: "h1",
        protocol_number: "MJ-5",
        environment: "producao",
      },
    },
    {
      id: "a1",
      evento: "ASSUMIDA",
      created_at: em(3),
      motivo: "Protocolo MJ-5 informado ao paciente",
      detalhes: { protocol_number: "MJ-5", protocolo_informado: true, message_id: "m9" },
    },
    {
      id: "au1",
      evento: "HANDOFF_AUDITORIA",
      created_at: em(4),
      motivo: "Handoff auditado · Protocolo MJ-5",
      detalhes: {
        protocol_number: "MJ-5",
        handoff_event_id: "h1",
        auditoria_completa: true,
        auditoria_faltando: [],
      },
    },
    { id: "r1", evento: "RESUMO_IA_GERADO", created_at: em(34), detalhes: { versao: 1 } },
    {
      id: "as1",
      evento: "ASSUMIDA",
      created_at: em(43),
      user_id: "u-jean",
      user_nome: "JEAN TELEFONE",
      motivo: "Atribuição automática (menor carga)",
      detalhes: { metodo: "distribuicao_automatica", origem: "queue_distribution" },
    },
  ];
  const marcadores: MarcadorSistemaTimeline[] = [
    {
      id: "s1",
      body: "🧾 Handoff realizado pela Nina · Protocolo: MJ-5 · Destino: fila",
      created_at: em(0.3),
      enviada_por: "sistema",
    },
    {
      id: "s2",
      body: "🔁 Conversa transferida da Nina para atendimento humano · Setor: Recepção",
      created_at: em(0.4),
      enviada_por: "sistema",
    },
    {
      id: "s3",
      body: "👤 Atribuída automaticamente a JEAN TELEFONE (online).",
      created_at: em(43.2),
      enviada_por: "sistema",
    },
    {
      id: "real",
      body: "Bom dia, meu coração está acelerado",
      created_at: em(-10),
      enviada_por: "paciente",
    },
  ];
  return { eventos, marcadores };
}

describe("agrupamento semântico da timeline", () => {
  it("consolida o handoff inteiro em um único grupo com dados estruturados", () => {
    const { itens } = agruparTimeline(cenarioReal());
    const handoff = itens.find((i) => i.tipo === "HANDOFF");
    expect(handoff).toBeDefined();
    if (handoff?.tipo !== "HANDOFF") throw new Error("grupo ausente");
    expect(handoff.eventoIds).toEqual(["h1", "f1", "p1", "a1", "au1"]);
    expect(handoff.marcadorIds).toEqual(["s1", "s2"]);
    expect(handoff.protocolo).toBe("MJ-5");
    expect(handoff.filaInicial).toBe(4);
    expect(handoff.origem).toBe("IA");
    expect(handoff.urgencia).toBe("alta");
    expect(handoff.status).toBe("PROTOCOLO_INFORMADO");
    expect(handoff.auditoria).toEqual({ registrada: true, completa: true, faltando: [] });
  });

  it("consolida evento e marcador da mesma atribuição em um item só", () => {
    const { itens, marcadorParaItem } = agruparTimeline(cenarioReal());
    const atrib = itens.filter((i) => i.tipo === "ATRIBUICAO");
    expect(atrib).toHaveLength(1);
    if (atrib[0]?.tipo !== "ATRIBUICAO") throw new Error("grupo ausente");
    expect(atrib[0].atendenteNome).toBe("JEAN TELEFONE");
    expect(atrib[0].atendenteUserId).toBe("u-jean");
    expect(atrib[0].automatica).toBe(true);
    // FASE 5: o título do card já diz "Atribuição automática" — o critério não repete.
    expect(atrib[0].criterio).toBe("Menor carga");
    expect(atrib[0].statusAtendente).toBe("ONLINE");
    expect(atrib[0].marcadorIds).toEqual(["s3"]);
    expect(marcadorParaItem.get("s3")).toBe(atrib[0].chave);
  });

  it("nunca agrupa mensagem real do paciente", () => {
    const { marcadorParaItem } = agruparTimeline(cenarioReal());
    expect(marcadorParaItem.has("real")).toBe(false);
  });

  it("é determinístico e independente da ordem de entrada", () => {
    const c = cenarioReal();
    const a = agruparTimeline(c);
    const b = agruparTimeline({
      eventos: [...c.eventos].reverse(),
      marcadores: [...c.marcadores].reverse(),
    });
    expect(JSON.stringify(b.itens)).toBe(JSON.stringify(a.itens));
  });

  it("não mistura eventos de handoffs diferentes", () => {
    const eventos: EventoTimeline[] = [
      { id: "h1", evento: "HANDOFF_SOLICITADO", created_at: em(0), detalhes: { solicitado_por: "IA" } },
      {
        id: "p1",
        evento: "HANDOFF_SOLICITADO",
        created_at: em(1),
        motivo: "Protocolo MJ-1 gerado (handoff)",
        detalhes: { handoff_event_id: "h1", protocol_number: "MJ-1" },
      },
      { id: "h2", evento: "HANDOFF_SOLICITADO", created_at: em(600), detalhes: { solicitado_por: "IA" } },
      { id: "f2", evento: "ENTROU_NA_FILA", created_at: em(600.5), detalhes: { posicao: 2 } },
      {
        id: "au2",
        evento: "HANDOFF_AUDITORIA",
        created_at: em(602),
        detalhes: { handoff_event_id: "h2", protocol_number: "MJ-2", auditoria_completa: false },
      },
    ];
    const { itens } = agruparTimeline({ eventos });
    const grupos = itens.filter((i) => i.tipo === "HANDOFF");
    expect(grupos).toHaveLength(2);
    if (grupos[0]?.tipo !== "HANDOFF" || grupos[1]?.tipo !== "HANDOFF") throw new Error("x");
    expect(grupos[0].eventoIds).toEqual(["h1", "p1"]);
    expect(grupos[1].eventoIds).toEqual(["h2", "f2", "au2"]);
    expect(grupos[1].auditoria.completa).toBe(false);
  });

  it("histórico antigo sem identificador agrupa só dentro da janela", () => {
    const eventos: EventoTimeline[] = [
      { id: "h1", evento: "HANDOFF_SOLICITADO", created_at: em(0), detalhes: null },
      { id: "f1", evento: "ENTROU_NA_FILA", created_at: em(1), detalhes: { posicao: 1 } },
      { id: "f2", evento: "ENTROU_NA_FILA", created_at: em(4000), detalhes: { posicao: 9 } },
    ];
    const { itens } = agruparTimeline({ eventos });
    const grupo = itens[0];
    if (grupo?.tipo !== "HANDOFF") throw new Error("grupo ausente");
    expect(grupo.eventoIds).toEqual(["h1", "f1"]);
    expect(itens.some((i) => i.tipo === "EVENTO" && i.evento.id === "f2")).toBe(true);
  });

  it("colapsa repetições idênticas do mesmo aviso (resumo gravado N vezes)", () => {
    const eventos: EventoTimeline[] = [
      { id: "r1", evento: "RESUMO_IA_GERADO", created_at: em(10), detalhes: { versao: 2 } },
      { id: "r2", evento: "RESUMO_IA_GERADO", created_at: em(10.2), detalhes: { versao: 2 } },
      { id: "r3", evento: "RESUMO_IA_GERADO", created_at: em(10.4), detalhes: { versao: 2 } },
      { id: "r4", evento: "RESUMO_IA_GERADO", created_at: em(20), detalhes: { versao: 3 } },
    ];
    const { itens, eventoParaItem } = agruparTimeline({ eventos });
    expect(itens).toHaveLength(2);
    if (itens[0]?.tipo !== "EVENTO") throw new Error("x");
    expect(itens[0].repetidos).toEqual(["r2", "r3"]);
    expect(eventoParaItem.get("r3")).toBe("r1");
  });

  it("transferência manual preserva origem, destino e setor", () => {
    const eventos: EventoTimeline[] = [
      {
        id: "t1",
        evento: "TRANSFERIDA",
        created_at: em(0),
        user_id: "u-adm",
        de_nome: "ANA",
        para_nome: "BRUNO",
        motivo: "Caso financeiro",
        detalhes: { manual: true, de_user_id: "u-ana", para_user_id: "u-bruno", setor_nome: "Financeiro" },
      },
    ];
    const { itens } = agruparTimeline({ eventos });
    if (itens[0]?.tipo !== "ATRIBUICAO") throw new Error("x");
    expect(itens[0].automatica).toBe(false);
    expect(itens[0].transferencia).toBe(true);
    expect(itens[0].atendenteNome).toBe("BRUNO");
    expect(itens[0].origemNome).toBe("ANA");
    expect(itens[0].setorNome).toBe("Financeiro");
  });

  it("todo evento recebido aparece representado por algum item", () => {
    const { eventos } = cenarioReal();
    const { eventoParaItem } = agruparTimeline({ eventos });
    for (const e of eventos) expect(eventoParaItem.has(e.id)).toBe(true);
  });
});

describe("FASE 3 — espera por atendente", () => {
  const handoff = (chave: string, criadoEm: string) =>
    ({
      tipo: "HANDOFF",
      chave,
      criadoEm,
      motivo: null,
      urgencia: null,
      protocolo: "MJ-7",
      filaInicial: null,
      origem: "IA",
      status: "NA_FILA",
      auditoria: { registrada: false, completa: null, faltando: [] },
      eventoIds: [],
      marcadorIds: [],
    }) as any;
  const atribuicao = (chave: string, criadoEm: string) =>
    ({
      tipo: "ATRIBUICAO",
      chave,
      criadoEm,
      atendenteUserId: null,
      atendenteNome: "JEAN",
      automatica: true,
      criterio: "menor carga",
      statusAtendente: "online",
      transferencia: false,
      origemNome: null,
      realizadaPorNome: null,
      setorNome: null,
      eventoIds: [],
      marcadorIds: [],
    }) as any;

  it("handoff seguido de atribuição não fica aguardando", () => {
    const r = handoffsAguardandoAtendente([
      handoff("h1", "2026-09-10T11:23:00Z"),
      atribuicao("a1", "2026-09-10T11:23:05Z"),
    ]);
    expect(r.size).toBe(0);
  });

  it("handoff sem atribuição posterior fica aguardando", () => {
    const r = handoffsAguardandoAtendente([handoff("h1", "2026-09-10T11:23:00Z")]);
    expect([...r]).toEqual(["h1"]);
  });

  it("com dois handoffs, só o que não recebeu atribuição fica aguardando", () => {
    const r = handoffsAguardandoAtendente([
      handoff("h1", "2026-09-10T11:00:00Z"),
      atribuicao("a1", "2026-09-10T11:01:00Z"),
      handoff("h2", "2026-09-10T12:00:00Z"),
    ]);
    expect([...r]).toEqual(["h2"]);
  });
});

// FASE 5 — regressão sobre a sequência real de um handoff de produção:
// sete registros internos + três marcadores devem virar dois cards.
describe("FASE 5 — sequência real de handoff", () => {
  const eventos = [
    { id: "e1", evento: "REABERTA", user_id: null, motivo: "Conversa reaberta", detalhes: null, created_at: "2026-09-09T18:17:02.212Z" },
    { id: "h1", evento: "HANDOFF_SOLICITADO", user_id: null, motivo: "Paciente solicitou falar com atendente humana.", detalhes: { urgencia: "normal", solicitado_por: "IA" }, created_at: "2026-09-09T18:17:38.469Z" },
    { id: "f1", evento: "ENTROU_NA_FILA", user_id: null, motivo: null, detalhes: { posicao: 4 }, created_at: "2026-09-09T18:17:38.593Z" },
    { id: "p1", evento: "HANDOFF_SOLICITADO", user_id: null, motivo: "Protocolo MJ-3 gerado (handoff)", detalhes: { protocol_number: "MJ-3", handoff_event_id: "h1" }, created_at: "2026-09-09T18:17:38.948Z" },
    { id: "p2", evento: "ASSUMIDA", user_id: null, motivo: "Protocolo MJ-3 informado ao paciente", detalhes: { protocol_number: "MJ-3", protocolo_informado: true }, created_at: "2026-09-09T18:17:41.715Z" },
    { id: "a1", evento: "ASSUMIDA", user_id: "u1", motivo: "Atribuição automática (menor carga)", detalhes: { metodo: "distribuicao_automatica", perfil: "telefonia", presence_status: "ONLINE", atendente_user_id: "u1" }, created_at: "2026-09-09T18:17:43.922Z", user_nome: "JEAN TELEFONE" },
    { id: "x1", evento: "HANDOFF_AUDITORIA", user_id: null, motivo: "Handoff auditado · Protocolo MJ-3", detalhes: { protocol_number: "MJ-3", handoff_event_id: "h1", auditoria_completa: true, auditoria_faltando: [] }, created_at: "2026-09-09T18:17:46.112Z" },
  ];
  const marcadores = [
    { id: "m1", body: "Vou encaminhar seu atendimento…\nProtocolo do atendimento: MJ-3", created_at: "2026-09-09T18:17:41.617Z", enviada_por: "sistema", status: "sent" },
    { id: "m2", body: "🧾 Handoff realizado pela Nina · Protocolo: MJ-3 · Destino: Não atribuídas", created_at: "2026-09-09T18:17:41.921Z", enviada_por: "sistema", status: "system" },
    { id: "m3", body: "🔁 Conversa transferida da Nina para atendimento humano · Motivo: x · Posição 4", created_at: "2026-09-09T18:17:43.680Z", enviada_por: "sistema", status: "system" },
    { id: "m4", body: "👤 Atribuída automaticamente a JEAN TELEFONE (online).", created_at: "2026-09-09T18:17:44.220Z", enviada_por: "sistema", status: "system" },
  ];

  it("gera um card de handoff e um de atribuição, sem eventos soltos redundantes", () => {
    const r = agruparTimeline({ eventos: eventos as any, marcadores: marcadores as any });
    expect(r.itens.map((i) => i.tipo)).toEqual(["EVENTO", "HANDOFF", "ATRIBUICAO"]);

    const h = r.itens[1] as any;
    expect(h.protocolo).toBe("MJ-3");
    expect(h.filaNome).toBe("Não atribuídas");
    expect(h.filaInicial).toBe(4);
    expect(h.status).toBe("PROTOCOLO_INFORMADO");
    expect(h.auditoria).toEqual({ registrada: true, completa: true, faltando: [] });
    expect(h.eventoIds).toEqual(["h1", "f1", "p1", "p2", "x1"]);

    const a = r.itens[2] as any;
    expect(a.atendenteNome).toBe("JEAN TELEFONE");
    expect(a.criterio).toBe("Menor carga");
    expect(a.statusAtendente).toBe("ONLINE");
    expect(a.marcadorIds).toEqual(["m4"]);
  });

  it("mensagem real enviada ao paciente nunca é absorvida por um card", () => {
    const r = agruparTimeline({ eventos: eventos as any, marcadores: marcadores as any });
    expect(r.marcadorParaItem.has("m1")).toBe(false);
    expect(r.marcadorParaItem.get("m2")).toBe("h1");
    expect(r.marcadorParaItem.get("m3")).toBe("h1");
  });
});
