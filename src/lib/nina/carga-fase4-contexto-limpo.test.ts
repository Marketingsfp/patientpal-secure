/**
 * FASE 4 — prova de que cada teste de carga começa com contexto 100% limpo.
 *
 * Roda contra um banco simulado em memória, com o mesmo formato de chamadas
 * que a rotina canônica de reset (`resetarLeadTeste`) faz no banco real.
 * Nada aqui toca WhatsApp, pacientes reais ou produção: só leads sintéticos.
 */
import { describe, expect, it, beforeEach, mock } from "bun:test";
import {
  prepararLeads,
  baselineLead,
  metricasPreflight,
  pendentesPreflight,
  leadsParticipantes,
  descreverPreparacaoParcial,
  type BaselineLead,
} from "@/lib/nina/carga-preflight";

// ---------------------------------------------------------------- banco fake
type Lead = {
  id: string;
  clinica_id: string;
  indice: number;
  nome: string;
  telefone_base: string;
  telefone_sessao: string;
  sessao_seq: number;
  conversa_id: string | null;
  ciclo_id: string | null;
  ciclo_iniciado_em: string | null;
  resolvido_em: string | null;
  status: string;
};

const CLINICA = "c1";
let leads: Lead[] = [];
let conversas: any[] = [];
let batches: any[] = [];
let locks: any[] = [];
let ciclos: any[] = [];
let eventos: Array<{ conversaId: string; evento: string }> = [];
let revisoes: Record<string, number> = {};
/** Ordem real das operações do reset, para provar o encadeamento. */
let ordem: string[] = [];
let falharLead: string | null = null;

mock.module("@/lib/nina/revisao-conversa.server", () => ({
  incrementarRevisaoConversa: async ({ conversaId }: any) => {
    ordem.push(`revisao:${conversaId}`);
    revisoes[conversaId] = (revisoes[conversaId] ?? 0) + 1;
    return revisoes[conversaId];
  },
}));

mock.module("@/lib/atendimento/handoff.server", () => ({
  registrarEvento: async ({ conversaId, evento }: any) => {
    eventos.push({ conversaId, evento });
  },
  registrarMarcadorSistema: async () => {},
}));

function tabela(nome: string, linhas: any[]) {
  const filtros: Array<(l: any) => boolean> = [];
  let patch: any = null;
  let apagar = false;
  const alvo = () => linhas.filter((l) => filtros.every((f) => f(l)));
  const executar = () => {
    const sel = alvo();
    if (patch) {
      ordem.push(`update:${nome}`);
      for (const l of sel) Object.assign(l, patch);
    }
    if (apagar) {
      ordem.push(`delete:${nome}`);
      for (const l of sel) linhas.splice(linhas.indexOf(l), 1);
    }
    return { data: sel, error: null };
  };
  const api: any = {
    select: () => api,
    update: (p: any) => {
      patch = p;
      return api;
    },
    delete: () => {
      apagar = true;
      return api;
    },
    eq: (c: string, v: any) => {
      filtros.push((l) => l[c] === v);
      return api;
    },
    is: (c: string, v: any) => {
      filtros.push((l) => l[c] === v);
      return api;
    },
    in: (c: string, v: any[]) => {
      filtros.push((l) => v.includes(l[c]));
      return api;
    },
    like: (c: string, v: string) => {
      const pre = v.replace(/%$/, "");
      filtros.push((l) => String(l[c] ?? "").startsWith(pre));
      return api;
    },
    maybeSingle: async () => {
      const l = alvo()[0];
      return { data: l ? { ...l } : null, error: null };
    },
    then: (res: any, rej: any) => Promise.resolve(executar()).then(res, rej),
  };
  return api;
}

const admin = {
  from: (t: string) => {
    if (t === "nina_teste_leads") {
      if (falharLead) {
        const quebrado: any = {
          select: () => quebrado,
          update: () => quebrado,
          eq: (c: string, v: any) => {
            if (c === "id" && v === falharLead) quebrado.quebrar = true;
            return quebrado;
          },
          is: () => quebrado,
          in: () => quebrado,
          maybeSingle: async () =>
            quebrado.quebrar
              ? { data: null, error: { message: "falha simulada de banco" } }
              : { data: leads[0] ?? null, error: null },
          then: (res: any) => Promise.resolve({ data: [], error: null }).then(res),
        };
        return quebrado;
      }
      return tabela(t, leads);
    }
    if (t === "atend_conversas") return tabela(t, conversas);
    if (t === "nina_message_batches") return tabela(t, batches);
    if (t === "nina_conversa_locks") return tabela(t, locks);
    if (t === "nina_teste_ciclos") return tabela(t, ciclos);
    if (t === "agendamentos") return tabela(t, []);
    throw new Error(`tabela não simulada: ${t}`);
  },
};

// ------------------------------------------------------------------ cenários
function semear(qtd: number, sujo = true) {
  leads = [];
  conversas = [];
  batches = [];
  locks = [];
  ciclos = [];
  eventos = [];
  revisoes = {};
  ordem = [];
  falharLead = null;
  for (let i = 1; i <= qtd; i++) {
    const conversaId = sujo ? `conv-${i}` : null;
    leads.push({
      id: `lead-${i}`,
      clinica_id: CLINICA,
      indice: i,
      nome: `Lead ${i}`,
      telefone_base: `5511900000${i}`,
      telefone_sessao: `5511900000${i}-s1`,
      sessao_seq: 1,
      conversa_id: conversaId,
      ciclo_id: sujo ? `ciclo-${i}` : null,
      ciclo_iniciado_em: sujo ? "2026-01-01T10:00:00.000Z" : null,
      resolvido_em: null,
      status: "ativa",
    });
    if (!sujo) continue;
    conversas.push({
      id: conversaId,
      clinica_id: CLINICA,
      status: "open",
      owner_type: "AI",
      ai_enabled: true,
      atribuida_user_id: null,
      identidade_confirmada: true,
      identidade_perguntada_em: "2026-01-01T10:00:00.000Z",
      identidade_tentativas: 2,
      // memória contaminada do teste anterior: intenção, nome e data
      nina_fluxo_estado: {
        intencao: "agendar",
        especialidade: "neurologista",
        paciente_nome: "João",
        data_desejada: "sexta-feira",
        estagio: "confirmar_slot",
      },
      patient_response_deadline: "2026-01-01T11:00:00.000Z",
      awaiting_patient_since: "2026-01-01T10:30:00.000Z",
      handoff_resumo: "resumo antigo",
      handoff_motivo: "motivo antigo",
    });
    batches.push({
      id: `batch-${i}`,
      clinica_id: CLINICA,
      conversa_id: conversaId,
      status: "PROCESSING",
      processed_at: null,
    });
    locks.push({
      id: `lock-${i}`,
      clinica_id: CLINICA,
      chave: `${CLINICA}:5511900000${i}-s1`,
      liberado_em: null,
      expira_em: "2026-01-01T10:01:30.000Z",
    });
    ciclos.push({ id: `ciclo-${i}`, clinica_id: CLINICA, status: "ativo", end_reason: null });
  }
}

async function resetar(lead: Lead) {
  const { resetarLeadTeste } = await import("@/lib/nina/teste-console.server");
  return await resetarLeadTeste(admin as any, {
    clinicaId: CLINICA,
    leadId: lead.id,
    userId: "u1",
    origem: "carga_preflight",
  });
}

beforeEach(() => semear(1));

describe("FASE 4 — contexto limpo entre testes de carga", () => {
  it("teste A → teste B com o mesmo lead não compartilha memória da Nina", async () => {
    const resumo = await prepararLeads({ leads, resetar });
    expect(resumo.pronto).toBe(true);

    // memória real zerada na conversa do teste A
    const conversaA = conversas.find((c) => c.id === "conv-1")!;
    expect(conversaA.nina_fluxo_estado).toBeNull();
    expect(conversaA.status).toBe("finished");
    expect(conversaA.ai_enabled).toBe(false);
    expect(conversaA.identidade_confirmada).toBe(false);
    expect(conversaA.awaiting_patient_since).toBeNull();
    expect(conversaA.patient_response_deadline).toBeNull();
    expect(conversaA.handoff_resumo).toBeNull();
    expect(conversaA.handoff_motivo).toBeNull();

    // o lead entra no teste B sem conversa, sem ciclo e com telefone novo
    const lead = leads[0]!;
    expect(lead.conversa_id).toBeNull();
    expect(lead.ciclo_id).toBeNull();
    expect(lead.sessao_seq).toBe(2);
    expect(lead.telefone_sessao).not.toBe("5511900000 1-s1".replace(" ", ""));

    // nada de "neurologista/João/sexta-feira" sobra em estado ativo
    const ativos = JSON.stringify({ leads, batchesAtivos: batches.filter((b) => b.status !== "SUPERSEDED") });
    expect(ativos).not.toContain("neurologista");
    expect(ativos).not.toContain("João");
    expect(ativos).not.toContain("sexta-feira");
  });

  it("neutraliza processamento antigo antes de qualquer outra escrita", async () => {
    await prepararLeads({ leads, resetar });
    // a revisão da conversa sobe ANTES do primeiro update
    expect(ordem[0]).toBe("revisao:conv-1");
    expect(revisoes["conv-1"]).toBe(1);
    // lote em voo vira obsoleto e o lock do ciclo é liberado
    expect(batches[0]!.status).toBe("SUPERSEDED");
    expect(locks[0]!.liberado_em).not.toBeNull();
  });

  it("com 10 leads, todos ficam prontos e nenhum estado antigo sobrevive", async () => {
    semear(10);
    const participantes = leadsParticipantes(leads, 10);
    const resumo = await prepararLeads({ leads: participantes, resetar });
    expect(resumo.pronto).toBe(true);
    expect(resumo.prontos).toBe(10);
    expect(leads.every((l) => l.conversa_id === null && l.ciclo_id === null)).toBe(true);
    expect(conversas.every((c) => c.nina_fluxo_estado === null && c.status === "finished")).toBe(true);
    expect(batches.every((b) => b.status === "SUPERSEDED")).toBe(true);
    expect(ciclos.every((c) => c.end_reason === "resolvido_manual")).toBe(true);
  });

  it("preflight é idempotente: lead já limpo não gera eventos nem ciclo extra", async () => {
    await prepararLeads({ leads, resetar });
    const eventosApos1 = eventos.length;
    const ciclosEncerrados = ciclos.filter((c) => c.end_reason).length;
    const segundo = await prepararLeads({ leads, resetar });
    expect(segundo.pronto).toBe(true);
    expect(segundo.resultados[0]!.jaLimpo).toBe(true);
    expect(eventos.length).toBe(eventosApos1);
    expect(ciclos.filter((c) => c.end_reason).length).toBe(ciclosEncerrados);
  });

  it("falha no reset de um lead aborta o gate e não libera disparos", async () => {
    semear(6);
    falharLead = "lead-6";
    const resumo = await prepararLeads({ leads, resetar });
    expect(resumo.pronto).toBe(false);
    expect(resumo.falhas.length).toBeGreaterThan(0);
    expect(descreverPreparacaoParcial(resumo.prontos, resumo.total)).toContain("O teste não foi iniciado");
  });

  it("nova tentativa: corrigido o problema, o preflight completa e libera o teste", async () => {
    semear(3);
    falharLead = "lead-3";
    const primeiro = await prepararLeads({ leads, resetar });
    expect(primeiro.pronto).toBe(false);
    const baselines = primeiro.resultados
      .filter((r) => r.situacao === "READY")
      .map((resultado) => baselineLead({ runId: "run-A", resultado }));

    falharLead = null;
    const pendentes = pendentesPreflight(leads, baselines);
    const segundo = await prepararLeads({ leads: pendentes, resetar });
    const todos = [
      ...baselines,
      ...segundo.resultados
        .filter((r) => r.situacao === "READY")
        .map((resultado) => baselineLead({ runId: "run-A", resultado })),
    ];
    expect(todos.length).toBe(3);
  });

  it("histórico não é apagado: ciclos e conversas antigas continuam auditáveis", async () => {
    await prepararLeads({ leads, resetar });
    expect(conversas.length).toBe(1);
    expect(ciclos.length).toBe(1);
    expect(eventos.map((e) => e.evento)).toContain("IA_MEMORIA_RESETADA");
    expect(eventos.map((e) => e.evento)).toContain("FINALIZADA");
    expect(ordem.some((o) => o.startsWith("delete:"))).toBe(false);
  });

  it("runId independente e métricas técnicas do preflight", async () => {
    semear(4);
    // lead 4 já limpo antes do teste
    leads[3]!.conversa_id = null;
    leads[3]!.ciclo_id = null;
    const resumo = await prepararLeads({ leads, resetar });
    const baselines: BaselineLead[] = resumo.resultados
      .filter((r) => r.situacao === "READY")
      .map((resultado) => baselineLead({ runId: "run-B", resultado }));
    expect(baselines.every((b) => b.runId === "run-B")).toBe(true);
    const m = metricasPreflight(baselines, 4);
    expect(m).toEqual({
      leadsPreparados: 4,
      leadsTotal: 4,
      falhas: 0,
      memoriasResetadas: 3,
      ciclosAnterioresEncerrados: 3,
    });
  });
});
