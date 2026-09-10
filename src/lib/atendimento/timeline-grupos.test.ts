import { describe, expect, it } from "bun:test";
import {
  agruparTimeline,
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
    expect(atrib[0].criterio).toBe("Atribuição automática (menor carga)");
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
