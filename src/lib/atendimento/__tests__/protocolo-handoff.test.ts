import { describe, expect, it } from "bun:test";
import {
  ambienteDoHandoff,
  deveInformarProtocolo,
  vinculoProtocolo,
} from "@/lib/atendimento/protocolo-handoff";

describe("ambiente do handoff", () => {
  it("separa homologação de produção sem mudar a regra", () => {
    expect(ambienteDoHandoff(false)).toBe("producao");
    expect(ambienteDoHandoff(null)).toBe("producao");
    expect(ambienteDoHandoff(true)).toBe("homologacao");
  });
});

describe("vínculo do protocolo com o evento de handoff", () => {
  it("guarda conversa, evento, número, data e ambiente", () => {
    const v = vinculoProtocolo({
      conversaId: "conv-1",
      handoffEventoId: "ev-1",
      protocolo: "MJ-14712",
      criadoEm: "2026-09-07T18:00:00Z",
      ambiente: "producao",
    });
    expect(v).toEqual({
      conversation_id: "conv-1",
      handoff_event_id: "ev-1",
      protocol_number: "MJ-14712",
      created_at: "2026-09-07T18:00:00Z",
      environment: "producao",
    });
  });

  it("aceita handoff sem evento registrado sem quebrar o vínculo", () => {
    expect(
      vinculoProtocolo({ conversaId: "c", protocolo: "MJ-2", ambiente: "homologacao" })
        .handoff_event_id,
    ).toBeNull();
  });
});

describe("idempotência do anúncio", () => {
  it("informa uma única vez por atendimento", () => {
    expect(deveInformarProtocolo({ protocolo: "MJ-14712", jaInformado: false })).toBe(true);
    expect(deveInformarProtocolo({ protocolo: "MJ-14712", jaInformado: true })).toBe(false);
  });

  it("sem protocolo (clínica sem configuração) não há nada a informar", () => {
    expect(deveInformarProtocolo({ protocolo: null, jaInformado: false })).toBe(false);
  });
});

// FASE 3 — integração ao fluxo real: 1 handoff = 1 protocolo = 1 comunicação.
describe("fase 3 — comunicação única e retry", () => {
  it("retry após falha de envio reutiliza o mesmo protocolo e reenvia", () => {
    const protocolo = "MJ-14712";
    // 1ª tentativa falhou: nada foi marcado como informado.
    expect(deveInformarProtocolo({ protocolo, jaInformado: false })).toBe(true);
    // 2ª tentativa: mesmo número, nenhum protocolo novo é gerado.
    expect(deveInformarProtocolo({ protocolo, jaInformado: false })).toBe(true);
  });

  it("evento duplicado de handoff não gera segunda comunicação", () => {
    expect(deveInformarProtocolo({ protocolo: "MJ-14712", jaInformado: true })).toBe(false);
  });

  it("sem atendente online o vínculo continua completo", () => {
    const v = vinculoProtocolo({
      conversaId: "c1",
      handoffEventoId: "e1",
      protocolo: "MJ-14713",
      ambiente: "producao",
    });
    expect(v.protocol_number).toBe("MJ-14713");
    expect(v.handoff_event_id).toBe("e1");
  });
});

describe("fase 3 — resumo entregue ao humano", () => {
  it("reutiliza o protocolo do handoff como primeiro bloco", async () => {
    const { normalizarResumo, l } = await import("../handoff-resumo");
    const r = normalizarResumo(
      { intencao: "agendamento", motivo_contato: "Quer marcar ultrassom" },
      { protocolo: "MJ-14712" },
    );
    expect(r.protocolo).toBe("MJ-14712");
    expect(l(r)[0]).toEqual({ titulo: "Protocolo", itens: ["MJ-14712"] });
  });
});
