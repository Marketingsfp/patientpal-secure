import { describe, it, expect } from "bun:test";
import {
  ehConversacional,
  resumirLeads,
  previaTexto,
  type MensagemResumoRow,
} from "@/lib/nina/leads-resumo";

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
