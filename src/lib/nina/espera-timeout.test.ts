/**
 * FASE 5 — cenários ponta a ponta do timeout da Nina.
 *
 * Os cenários rodam contra um banco simulado em memória, com o mesmo formato
 * de chamadas que o processador usa em produção. O objetivo é provar as
 * regras: um único handoff por vencimento, transferência só quando cabe, e
 * nenhuma resposta tardia executando agendamento antigo.
 */
import { describe, expect, it, mock, beforeEach } from "bun:test";

type Linha = {
  id: string;
  clinica_id: string;
  status: string;
  owner_type: string;
  ai_enabled: boolean;
  atribuida_user_id: string | null;
  patient_response_deadline: string | null;
  awaiting_patient_since: string | null;
  nina_fluxo_estado: unknown;
};

let banco: Linha[] = [];
const handoffs: string[] = [];
const eventos: Array<{ conversaId: string; evento: string }> = [];
const resumos: string[] = [];

function tabelaConversas() {
  let filtros: Array<(l: Linha) => boolean> = [];
  let patch: Partial<Linha> | null = null;
  const api: any = {
    select: () => api,
    not: () => api,
    lte: (_c: string, v: string) => {
      filtros.push((l) => !!l.patient_response_deadline && l.patient_response_deadline <= v);
      return api;
    },
    order: () => api,
    limit: () => api,
    maybeSingle: async () => ({ data: banco.filter((l) => filtros.every((f) => f(l)))[0] ?? null }),
    eq: (col: string, val: unknown) => {
      filtros.push((l) => (l as never as Record<string, unknown>)[col] === val);
      return api;
    },
    update: (p: Partial<Linha>) => {
      patch = p;
      return api;
    },
    then: (res: (v: { data: Linha[]; error: null }) => unknown) =>
      res({ data: aplicar(), error: null }),
  };
  function aplicar(): Linha[] {
    const alvo = banco.filter((l) => filtros.every((f) => f(l)));
    if (patch) for (const l of alvo) Object.assign(l, patch);
    return alvo;
  }
  api.select = (_c?: string) => {
    if (patch) {
      const alvo = aplicar();
      return Promise.resolve({ data: alvo.map((l) => ({ id: l.id })), error: null });
    }
    return api;
  };
  return api;
}

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (t: string) => (t === "atend_conversas" ? tabelaConversas() : tabelaVazia()),
  },
}));

function tabelaVazia() {
  const api: any = {
    select: () => api,
    eq: () => api,
    order: () => api,
    limit: () => api,
    update: () => api,
    maybeSingle: async () => ({ data: null }),
    then: (res: (v: { data: never[]; error: null }) => unknown) => res({ data: [], error: null }),
  };
  return api;
}

mock.module("@/lib/atendimento/handoff.server", () => ({
  STATUS_ENCERRADOS: ["closed", "finished", "resolved"],
  encaminharParaHumano: async (a: { conversaId: string }) => {
    handoffs.push(a.conversaId);
    const l = banco.find((x) => x.id === a.conversaId);
    if (l) {
      l.owner_type = "NONE";
      l.ai_enabled = false;
      l.status = "waiting";
    }
    return { ok: true };
  },
  registrarEvento: async (a: { conversaId: string; evento: string }) => {
    eventos.push({ conversaId: a.conversaId, evento: a.evento });
  },
}));

mock.module("@/lib/atendimento/handoff-resumo.server", () => ({
  garantirResumoHandoff: async (a: { conversaId: string }) => {
    resumos.push(a.conversaId);
    return null;
  },
}));

const { processarTimeoutsEsperaPaciente } = await import("./espera-timeout.server");

function conversa(over: Partial<Linha> = {}): Linha {
  return {
    id: "c1",
    clinica_id: "cl1",
    status: "bot_attending",
    owner_type: "AI",
    ai_enabled: true,
    atribuida_user_id: null,
    patient_response_deadline: "2026-09-05T10:30:00.000Z",
    awaiting_patient_since: "2026-09-05T10:00:00.000Z",
    nina_fluxo_estado: null,
    ...over,
  };
}

const AGORA = new Date("2026-09-05T10:31:00.000Z");

beforeEach(() => {
  banco = [];
  handoffs.length = 0;
  eventos.length = 0;
  resumos.length = 0;
});

describe("FASE 5 — cenários do timeout", () => {
  it("B: 30 min sem resposta → transfere para humano, com evento e resumo", async () => {
    banco = [conversa()];
    const r = await processarTimeoutsEsperaPaciente({ clinicaId: "cl1", agora: AGORA });
    expect(r.transferidas).toBe(1);
    expect(handoffs).toEqual(["c1"]);
    expect(eventos.some((e) => e.evento === "TIMEOUT_NINA")).toBe(true);
    expect(resumos).toEqual(["c1"]);
    // Conversa continua aberta — timeout não resolve nem fecha.
    expect(banco[0]!.status).toBe("waiting");
  });

  it("A: paciente respondeu (prazo limpo) → nenhum handoff", async () => {
    banco = [conversa({ patient_response_deadline: null })];
    const r = await processarTimeoutsEsperaPaciente({ clinicaId: "cl1", agora: AGORA });
    expect(r.transferidas).toBe(0);
    expect(handoffs).toHaveLength(0);
  });

  it("F: conversa resolvida antes do prazo → prazo cancelado, sem transferência", async () => {
    banco = [conversa({ status: "resolved" })];
    const r = await processarTimeoutsEsperaPaciente({ clinicaId: "cl1", agora: AGORA });
    expect(handoffs).toHaveLength(0);
    expect(r.ignoradas).toBe(1);
    expect(banco[0]!.patient_response_deadline).toBeNull();
  });

  it("D: conversa já humana → não volta para a Nina nem transfere de novo", async () => {
    banco = [conversa({ owner_type: "HUMAN", ai_enabled: false, atribuida_user_id: "u1" })];
    await processarTimeoutsEsperaPaciente({ clinicaId: "cl1", agora: AGORA });
    expect(handoffs).toHaveLength(0);
    expect(banco[0]!.owner_type).toBe("HUMAN");
  });

  it("I: dois jobs simultâneos → apenas um handoff e um resumo", async () => {
    banco = [conversa()];
    await Promise.all([
      processarTimeoutsEsperaPaciente({ clinicaId: "cl1", agora: AGORA }),
      processarTimeoutsEsperaPaciente({ clinicaId: "cl1", agora: AGORA }),
    ]);
    expect(handoffs).toHaveLength(1);
    expect(resumos).toHaveLength(1);
    expect(eventos.filter((e) => e.evento === "TIMEOUT_NINA")).toHaveLength(1);
  });

  it("repetir a execução depois não gera segundo handoff", async () => {
    banco = [conversa()];
    await processarTimeoutsEsperaPaciente({ clinicaId: "cl1", agora: AGORA });
    await processarTimeoutsEsperaPaciente({ clinicaId: "cl1", agora: AGORA });
    expect(handoffs).toHaveLength(1);
  });

  it("resposta em 5 min → prazo ainda vigente, nada é transferido", async () => {
    banco = [conversa()];
    const cincoMin = new Date("2026-09-05T10:05:00.000Z");
    const r = await processarTimeoutsEsperaPaciente({ clinicaId: "cl1", agora: cincoMin });
    expect(r.avaliadas).toBe(0);
    expect(handoffs).toHaveLength(0);
    expect(banco[0]!.patient_response_deadline).not.toBeNull();
  });

  it("resposta em 29 min → ainda dentro do prazo", async () => {
    banco = [conversa()];
    const vinteNove = new Date("2026-09-05T10:29:00.000Z");
    await processarTimeoutsEsperaPaciente({ clinicaId: "cl1", agora: vinteNove });
    expect(handoffs).toHaveLength(0);
  });

  it("corrida: paciente responde entre a leitura e a reserva → sem transferência", async () => {
    banco = [conversa()];
    // Resposta do paciente limpa o prazo; a reserva por prazo exato não casa.
    const p = processarTimeoutsEsperaPaciente({ clinicaId: "cl1", agora: AGORA });
    banco[0]!.patient_response_deadline = null;
    await p;
    expect(handoffs).toHaveLength(0);
  });

  it("após o timeout a Nina fica calada e a conversa segue ativa", async () => {
    banco = [conversa()];
    await processarTimeoutsEsperaPaciente({ clinicaId: "cl1", agora: AGORA });
    const { derivarResponsavel, ninaResponde } = await import(
      "@/lib/atendimento/ciclo-responsabilidade"
    );
    const l = banco[0]!;
    expect(derivarResponsavel(l)).toBe("FILA_HUMANA");
    expect(ninaResponde(l)).toBe(false);
    expect(l.status).toBe("waiting");
  });
});
