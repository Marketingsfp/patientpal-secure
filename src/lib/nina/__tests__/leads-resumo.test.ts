import { describe, it, expect } from "bun:test";
import {
  ehConversacional,
  resumirLeads,
  previaTexto,
  type MensagemResumoRow, aplicarMensagemRealtime, ordenarPorAtividade } from "@/lib/nina/leads-resumo";

const msg = (p: Partial<MensagemResumoRow> & { id: string; created_at: string }): MensagemResumoRow => ({
  conversa_id: "c1",
  direction: "in",
  body: "oi",
  tipo: "text",
  enviada_por: "paciente",
  read_at: null,
  ...p,
});

describe("leads-resumo", () => {
  it("usa a última mensagem do paciente", () => {
    const r = resumirLeads({ L1: ["c1"] }, [
      msg({ id: "m1", created_at: "2026-09-07T10:00:00Z", body: "primeira" }),
      msg({ id: "m2", created_at: "2026-09-07T10:05:00Z", body: "quero remarcar" }),
    ]);
    expect(r["L1"]!.lastMessageId).toBe("m2");
    expect(r["L1"]!.lastMessageText).toBe("quero remarcar");
    expect(r["L1"]!.lastMessageAuthor).toBe("paciente");
    expect(r["L1"]!.lastMessageAt).toBe("2026-09-07T10:05:00Z");
  });

  it("usa a última mensagem da Nina e conta como não lida", () => {
    const r = resumirLeads({ L1: ["c1"] }, [
      msg({ id: "m1", created_at: "2026-09-07T10:00:00Z" }),
      msg({
        id: "m2",
        created_at: "2026-09-07T10:01:00Z",
        direction: "out",
        enviada_por: "nina",
        body: "Claro, posso ajudar.",
      }),
    ]);
    expect(r["L1"]!.lastMessageAuthor).toBe("nina");
    expect(r["L1"]!.unreadCount).toBe(1);
  });

  it("evento técnico posterior não substitui a prévia", () => {
    const r = resumirLeads({ L1: ["c1"] }, [
      msg({ id: "m1", created_at: "2026-09-07T10:00:00Z", body: "boa tarde" }),
      msg({
        id: "ev",
        created_at: "2026-09-07T10:10:00Z",
        tipo: "sistema",
        enviada_por: "sistema",
        body: "Conversa transferida",
      }),
      msg({
        id: "ev2",
        created_at: "2026-09-07T10:11:00Z",
        tipo: "auditoria",
        enviada_por: "sistema",
        body: "PDF gerado",
      }),
    ]);
    expect(r["L1"]!.lastMessageId).toBe("m1");
    expect(r["L1"]!.totalMensagens).toBe(1);
    expect(ehConversacional(msg({ id: "x", created_at: "", tipo: "sistema", enviada_por: "sistema" }))).toBe(false);
  });

  it("não mistura leads nem sessões diferentes", () => {
    const r = resumirLeads({ L1: ["c1"], L2: ["c2"] }, [
      msg({ id: "a", conversa_id: "c1", created_at: "2026-09-07T10:00:00Z", body: "lead um" }),
      msg({ id: "b", conversa_id: "c2", created_at: "2026-09-07T11:00:00Z", body: "lead dois" }),
      msg({ id: "c", conversa_id: "c9", created_at: "2026-09-07T12:00:00Z", body: "outra sessão" }),
    ]);
    expect(r["L1"]!.lastMessageText).toBe("lead um");
    expect(r["L2"]!.lastMessageText).toBe("lead dois");
    expect(r["L1"]!.totalMensagens).toBe(1);
    expect(r["L2"]!.totalMensagens).toBe(1);
  });

  it("lead sem conversa fica vazio e mensagens em branco são ignoradas", () => {
    const r = resumirLeads({ L1: [] }, [msg({ id: "z", created_at: "2026-09-07T10:00:00Z", body: "   " })]);
    expect(r["L1"]!.lastMessageId).toBeNull();
    expect(r["L1"]!.unreadCount).toBe(0);
  });

  it("prévia é curta e sem quebras", () => {
    expect(previaTexto("linha\n  outra")).toBe("linha outra");
    expect(previaTexto("a".repeat(300)).length).toBe(120);
  });
});

describe("rótulo do autor na prévia", () => {
  it("mostra Paciente, Nina e Atendente", async () => {
    const { rotuloAutorResumo } = await import("@/lib/nina/leads-resumo");
    expect(rotuloAutorResumo("paciente")).toBe("Paciente");
    expect(rotuloAutorResumo("nina")).toBe("Nina");
    expect(rotuloAutorResumo("atendente")).toBe("Atendente");
    expect(rotuloAutorResumo(null)).toBe("");
  });
});

/** FASE 3 — contador de não lidas por leitura individual do usuário. */
describe("leads-resumo — não lidas (Fase 3)", () => {
  const nina = (id: string, at: string) =>
    msg({ id, created_at: at, direction: "out", enviada_por: "nina", body: "resposta" });

  it("mensagem nova em lead fechado conta 1", () => {
    const r = resumirLeads({ L1: ["c1"] }, [nina("n1", "2026-09-07T10:10:00Z")], {
      c1: "2026-09-07T10:00:00Z",
    });
    expect(r["L1"]!.unreadCount).toBe(1);
  });

  it("duas mensagens novas contam 2", () => {
    const r = resumirLeads(
      { L1: ["c1"] },
      [nina("n1", "2026-09-07T10:10:00Z"), nina("n2", "2026-09-07T10:11:00Z")],
      { c1: "2026-09-07T10:00:00Z" },
    );
    expect(r["L1"]!.unreadCount).toBe(2);
  });

  it("após abrir (marcador na última mensagem) fica zero", () => {
    const r = resumirLeads(
      { L1: ["c1"] },
      [nina("n1", "2026-09-07T10:10:00Z"), nina("n2", "2026-09-07T10:11:00Z")],
      { c1: "2026-09-07T10:11:00Z" },
    );
    expect(r["L1"]!.unreadCount).toBe(0);
  });

  it("evento técnico não aumenta o contador", () => {
    const r = resumirLeads(
      { L1: ["c1"] },
      [
        msg({
          id: "ev",
          created_at: "2026-09-07T10:20:00Z",
          direction: "out",
          enviada_por: "sistema",
          tipo: "evento",
          body: "sessão trocada",
        }),
      ],
      { c1: "2026-09-07T10:00:00Z" },
    );
    expect(r["L1"]!.unreadCount).toBe(0);
  });

  it("leitura de um usuário não se mistura com a de outro", () => {
    const mensagens = [nina("n1", "2026-09-07T10:10:00Z")];
    const usuarioA = resumirLeads({ L1: ["c1"] }, mensagens, { c1: "2026-09-07T10:10:00Z" });
    const usuarioB = resumirLeads({ L1: ["c1"] }, mensagens, {});
    expect(usuarioA["L1"]!.unreadCount).toBe(0);
    expect(usuarioB["L1"]!.unreadCount).toBe(1);
  });
});

describe("FASE 4 — inbox de homologação", () => {
  const base = { conversa_id: "c1", tipo: "text", read_at: null };
  const card = () => ({
    ultimaMensagemId: "m0" as string | null,
    ultimaMensagemTexto: "oi" as string | null,
    ultimaMensagemAutor: "paciente" as any,
    ultimaMensagemEm: "2026-09-07T10:00:00Z" as string | null,
    ultimaAtividadeEm: "2026-09-07T10:00:00Z" as string | null,
    mensagens: 3,
    naoLidas: 0,
  });
  const nova = {
    ...base,
    id: "m1",
    direction: "out",
    enviada_por: "nina",
    body: "Temos horários amanhã",
    created_at: "2026-09-07T11:00:00Z",
  };

  it("mensagem nova atualiza prévia, horário, total e contador", () => {
    const r = aplicarMensagemRealtime(card(), nova, { jaAplicada: false, abertoAgora: false });
    expect(r.ultimaMensagemId).toBe("m1");
    expect(r.ultimaMensagemAutor).toBe("nina");
    expect(r.ultimaMensagemEm).toBe("2026-09-07T11:00:00Z");
    expect(r.mensagens).toBe(4);
    expect(r.naoLidas).toBe(1);
  });

  it("mesma mensagem repetida no realtime não conta duas vezes", () => {
    const r1 = aplicarMensagemRealtime(card(), nova, { jaAplicada: false, abertoAgora: false });
    const r2 = aplicarMensagemRealtime(r1, nova, { jaAplicada: true, abertoAgora: false });
    expect(r2.mensagens).toBe(4);
    expect(r2.naoLidas).toBe(1);
    expect(r2.ultimaMensagemId).toBe("m1");
  });

  it("lead aberto na tela não ganha bolinha azul", () => {
    const r = aplicarMensagemRealtime(card(), nova, { jaAplicada: false, abertoAgora: true });
    expect(r.naoLidas).toBe(0);
    expect(r.ultimaMensagemId).toBe("m1");
  });

  it("evento técnico não vira prévia nem não lida", () => {
    const ev = { ...nova, id: "m2", tipo: "sistema", body: "sessão reiniciada" };
    const r = aplicarMensagemRealtime(card(), ev, { jaAplicada: false, abertoAgora: false });
    expect(r.ultimaMensagemId).toBe("m0");
    expect(r.naoLidas).toBe(0);
  });

  it("ordenação usa atividade de conversa e é estável no empate", () => {
    const ordenado = ordenarPorAtividade([
      { indice: 1, ultimaAtividadeEm: "2026-09-07T10:00:00Z" },
      { indice: 2, ultimaAtividadeEm: "2026-09-07T12:00:00Z" },
      { indice: 3, ultimaAtividadeEm: null },
      { indice: 4, ultimaAtividadeEm: null },
    ]);
    expect(ordenado.map((l) => l.indice)).toEqual([2, 1, 3, 4]);
  });
});
