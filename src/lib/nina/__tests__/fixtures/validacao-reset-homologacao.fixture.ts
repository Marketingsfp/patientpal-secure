/**
 * VALIDAÇÃO A–I — reset pelo botão manual ou pelo início autorizado da carga.
 *
 * Escopo: exclusivamente leads de homologação (`nina_teste_leads`, telefone
 * virtual, `is_teste`). Nada aqui toca WhatsApp real, pacientes reais,
 * produção, motor de confiança ou prompt publicado.
 *
 * Dois tipos de prova convivem neste arquivo:
 *  - EXECUÇÃO SIMULADA: roda a rotina canônica `resetarLeadTeste` contra um
 *    banco em memória com o mesmo formato de chamadas do banco real;
 *  - CONTRATO DE CÓDIGO: lê os arquivos e prova que nenhum outro caminho
 *    escreve sessão/telefone virtual nem emite reset de memória fora dos
 *    comandos explícitos. Iniciar carga reinicia os 10; retomar não reinicia.
 *
 * Nenhum destes testes conversa com a IA: execução real com a Nina é
 * verificação manual do operador no console de homologação.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = join(import.meta.dir, "..", "..", "..", "..", "..");
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

// ----------------------------------------------------------------- banco fake
const CLINICA = "c1";
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

let leads: Lead[] = [];
let conversas: any[] = [];
let mensagens: any[] = [];
let batches: any[] = [];
let locks: any[] = [];
let ciclos: any[] = [];
let eventos: Array<{ conversaId: string; evento: string; userId: string | null; detalhes: any }> =
  [];
let revisoes: Record<string, number> = {};
let ordem: string[] = [];

mock.module("@/lib/nina/revisao-conversa.server", () => ({
  incrementarRevisaoConversa: async ({ conversaId }: any) => {
    ordem.push(`revisao:${conversaId}`);
    revisoes[conversaId] = (revisoes[conversaId] ?? 0) + 1;
    return revisoes[conversaId];
  },
}));

mock.module("@/lib/atendimento/handoff.server", () => ({
  registrarEvento: async ({ conversaId, evento, userId, detalhes }: any) => {
    ordem.push(`evento:${evento}`);
    eventos.push({ conversaId, evento, userId: userId ?? null, detalhes });
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
    if (apagar) for (const l of sel) linhas.splice(linhas.indexOf(l), 1);
    return { data: sel, error: null };
  };
  const api: any = {
    select: () => api,
    update: (p: any) => ((patch = p), api),
    delete: () => ((apagar = true), api),
    eq: (c: string, v: any) => (filtros.push((l) => l[c] === v), api),
    is: (c: string, v: any) => (filtros.push((l) => l[c] === v), api),
    in: (c: string, v: any[]) => (filtros.push((l) => v.includes(l[c])), api),
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
    if (t === "nina_teste_leads") return tabela(t, leads);
    if (t === "atend_conversas") return tabela(t, conversas);
    if (t === "whatsapp_mensagens") return tabela(t, mensagens);
    if (t === "nina_message_batches") return tabela(t, batches);
    if (t === "nina_conversa_locks") return tabela(t, locks);
    if (t === "nina_teste_ciclos") return tabela(t, ciclos);
    if (t === "agendamentos") return tabela(t, []);
    throw new Error(`tabela não simulada: ${t}`);
  },
};

/** Dois leads de homologação com conversa em andamento (memória preenchida). */
function semear(total = 2) {
  leads = [];
  conversas = [];
  mensagens = [];
  batches = [];
  locks = [];
  ciclos = [];
  eventos = [];
  revisoes = {};
  ordem = [];
  for (let i = 1; i <= total; i++) {
    leads.push({
      id: `lead-${i}`,
      clinica_id: CLINICA,
      indice: i,
      nome: `Lead Teste 0${i}`,
      telefone_base: `550010000${i}`,
      telefone_sessao: `55001${i}00003`,
      sessao_seq: 3,
      conversa_id: `conv-${i}`,
      ciclo_id: `ciclo-${i}`,
      ciclo_iniciado_em: "2026-01-01T10:00:00.000Z",
      resolvido_em: null,
      status: "ativa",
    });
    conversas.push({
      id: `conv-${i}`,
      clinica_id: CLINICA,
      status: "open",
      owner_type: "AI",
      ai_enabled: true,
      identidade_confirmada: true,
      nina_fluxo_estado: {
        intencao: "agendar",
        paciente_nome: "João",
        especialidade: "neurologista",
      },
      patient_response_deadline: "2026-01-01T11:00:00.000Z",
      awaiting_patient_since: "2026-01-01T10:30:00.000Z",
      handoff_resumo: "resumo antigo",
      handoff_motivo: "motivo antigo",
    });
    mensagens.push(
      {
        id: `m-${i}-1`,
        clinica_id: CLINICA,
        conversa_id: `conv-${i}`,
        direction: "in",
        body: "ola bom dia",
      },
      {
        id: `m-${i}-2`,
        clinica_id: CLINICA,
        conversa_id: `conv-${i}`,
        direction: "out",
        body: "Bom dia!",
      },
    );
    batches.push({
      id: `b-${i}`,
      clinica_id: CLINICA,
      conversa_id: `conv-${i}`,
      status: "PROCESSING",
      processed_at: null,
    });
    locks.push({
      id: `lk-${i}`,
      clinica_id: CLINICA,
      chave: `${CLINICA}:55001${i}00003`,
      liberado_em: null,
      expira_em: "x",
    });
    ciclos.push({ id: `ciclo-${i}`, clinica_id: CLINICA, status: "ativo", end_reason: null });
  }
}

const leadDe = (id: string) => leads.find((l) => l.id === id)!;

async function clicarBotao(leadId: string, conversaId?: string | null) {
  const { resetarLeadTeste } = await import("@/lib/nina/teste-console.server");
  return await resetarLeadTeste(admin as any, {
    clinicaId: CLINICA,
    leadId,
    conversaId: conversaId ?? undefined,
    userId: "operador-1",
    origem: "console_teste",
    manual: true as const,
  });
}

beforeEach(() => semear());

// ============================================================== A, B, C, H
describe("A/B/C/H — reset exige comando explícito do operador", () => {
  it("A — demais fluxos não reiniciam sessão nem telefone virtual", () => {
    // Varredura no código de produção (fora de testes): nenhuma outra função
    // grava `sessao_seq` / `telefone_sessao` nem emite reset de memória.
    const alvos = [
      "src/lib/nina/simulador-terra.functions.ts",
      "src/lib/nina/cenarios.functions.ts",
      "src/lib/nina/correcao-ferramentas.server.ts",
      "src/lib/nina/resposta/finalizacao.server.ts",
      "src/lib/atendimento/handoff.server.ts",
      "src/lib/nina/espera-timeout.server.ts",
      "src/lib/nina/encerramento-automatico.server.ts",
    ];
    for (const arquivo of alvos) {
      const src = ler(arquivo);
      expect(src).not.toContain("sessao_seq:");
      expect(src).not.toContain("telefone_sessao:");
      expect(src).not.toContain("resetarLeadTeste");
      expect(src).not.toContain('evento: "IA_MEMORIA_RESETADA"');
    }
  });

  it("B — encaminhamento simulado/LOW não encerra ciclo nem zera memória", () => {
    const handoff = ler("src/lib/atendimento/handoff.server.ts");
    expect(handoff).not.toContain("encerrarCicloTestePorHandoff");
    // A rotina antiga que fechava o ciclo no encaminhamento foi removida.
    expect(() => ler("src/lib/nina/handoff-ciclo.server.ts")).toThrow();
  });

  it("A — início da carga reinicia os 10 leads; repetir preparação preserva as sessões", async () => {
    semear(10);
    const { prepararLeadsCarga } = await import("@/lib/nina/carga-preflight.server");
    // Snapshot persistido pelo comando Iniciar, anterior a qualquer reset.
    const entrada = {
      admin,
      clinicaId: CLINICA,
      userId: "operador-1",
      reiniciarNoInicio: true,
      leads: leads.map((lead) => ({ ...lead })) as Parameters<
        typeof prepararLeadsCarga
      >[0]["leads"],
    };
    const primeiro = await prepararLeadsCarga(entrada);
    expect(primeiro.pronto).toBe(true);
    expect(primeiro.prontos).toBe(10);
    expect(eventos.filter((e) => e.evento === "IA_MEMORIA_RESETADA")).toHaveLength(10);
    for (const lead of leads) {
      expect(lead.sessao_seq).toBe(4);
      expect(lead.conversa_id).toBeNull();
      expect(lead.ciclo_id).toBeNull();
    }
    for (const conversa of conversas) expect(conversa.nina_fluxo_estado).toBeNull();
    // Simula retomada após perder a resposta HTTP: usa o MESMO snapshot.
    const antesRetomar = JSON.stringify({ leads, conversas, eventos, revisoes });
    const retomada = await prepararLeadsCarga(entrada);
    expect(retomada.pronto).toBe(true);
    expect(retomada.resultados.every((r) => r.jaLimpo)).toBe(true);
    expect(JSON.stringify({ leads, conversas, eventos, revisoes })).toBe(antesRetomar);
  });

  it("A — retomar sem novo comando não apaga a memória de sessão ativa", async () => {
    const { prepararLeadsCarga } = await import("@/lib/nina/carga-preflight.server");
    const antes = JSON.stringify({ leads, conversas, eventos });
    const resultado = await prepararLeadsCarga({
      admin,
      clinicaId: CLINICA,
      userId: "operador-1",
      reiniciarNoInicio: false,
      leads: leads as Parameters<typeof prepararLeadsCarga>[0]["leads"],
    });
    expect(resultado.pronto).toBe(false);
    expect(resultado.falhas).toHaveLength(2);
    expect(JSON.stringify({ leads, conversas, eventos })).toBe(antes);
  });

  it("C — timeout e encerramento automático não tocam o lead de teste", () => {
    for (const a of [
      "src/lib/nina/espera-timeout.server.ts",
      "src/lib/nina/encerramento-automatico.server.ts",
    ]) {
      const src = ler(a);
      expect(src).not.toContain("nina_teste_leads");
      expect(src).not.toContain("nina_teste_ciclos");
    }
  });

  it("H — Terra, cenários, carga e correção assistida são recusados no servidor", async () => {
    const { resetarLeadTeste, ResetManualObrigatorioError } =
      await import("@/lib/nina/teste-console.server");
    const origens = [
      "terra",
      "cenario_inicio",
      "cenario_fim",
      "carga_preflight",
      "correcao_reteste",
    ];
    for (const origem of origens) {
      const antes = { ...leadDe("lead-1") };
      await expect(
        resetarLeadTeste(admin as any, {
          clinicaId: CLINICA,
          leadId: "lead-1",
          userId: null,
          origem,
          manual: false as unknown as true,
        }),
      ).rejects.toBeInstanceOf(ResetManualObrigatorioError);
      // Nada mudou: sessão, telefone, conversa e ciclo intactos.
      expect(leadDe("lead-1")).toEqual(antes as Lead);
    }
    expect(eventos).toHaveLength(0);
  });
});

// ===================================================================== E, I
describe("E/I — botão manual: alcance, auditoria e continuidade", () => {
  it("reinicia somente o lead selecionado", async () => {
    const antes1 = { ...leadDe("lead-1") };
    const antes2 = { ...leadDe("lead-2") };

    const r = await clicarBotao("lead-1", "conv-1");

    // sessão e número virtual ANTES x DEPOIS
    expect(antes1.sessao_seq).toBe(3);
    expect(antes1.telefone_sessao).toBe("55001100003");
    expect(r.sessaoAnterior).toBe(3);
    expect(r.sessao).toBe(4);
    expect(leadDe("lead-1").sessao_seq).toBe(4);
    expect(leadDe("lead-1").telefone_sessao).toBe("55000100004");
    expect(leadDe("lead-1").conversa_id).toBeNull();

    // o outro lead não foi tocado
    expect(leadDe("lead-2")).toEqual(antes2 as Lead);
    expect(conversas.find((c) => c.id === "conv-2")!.status).toBe("open");
  });

  it("preserva o histórico para auditoria", async () => {
    await clicarBotao("lead-1", "conv-1");
    // Conversa e mensagens continuam gravadas (apenas encerradas).
    expect(conversas.find((c) => c.id === "conv-1")).toBeDefined();
    expect(mensagens.filter((m) => m.conversa_id === "conv-1")).toHaveLength(2);
    expect(ciclos.find((c) => c.id === "ciclo-1")).toBeDefined();
    expect(ciclos.find((c) => c.id === "ciclo-1")!.status).not.toBe("ativo");
  });

  it("registra o clique responsável pelo reset", async () => {
    await clicarBotao("lead-1", "conv-1");
    const reset = eventos.find((e) => e.evento === "IA_MEMORIA_RESETADA")!;
    expect(reset.userId).toBe("operador-1");
    expect(reset.detalhes.operador).toBe("operador-1");
    expect(reset.detalhes.origem).toBe("console_teste");
    expect(reset.detalhes.sessao_anterior).toBe(3);
    expect(reset.detalhes.sessao_nova).toBe(4);
    expect(reset.detalhes.telefone_sessao_anterior).toBe("55001100003");
    expect(reset.detalhes.telefone_sessao_nova).toBe("55000100004");
    expect(typeof reset.detalhes.em).toBe("string");
    // O encerramento também fica na linha do tempo.
    expect(eventos.some((e) => e.evento === "FINALIZADA")).toBe(true);
  });

  it("I — contexto ativo antes do reset; contexto zerado depois", async () => {
    const conversa = conversas.find((c) => c.id === "conv-1")!;
    // ANTES: a Nina ainda enxerga a memória do teste em andamento.
    expect(conversa.nina_fluxo_estado).toMatchObject({ paciente_nome: "João" });
    expect(conversa.ai_enabled).toBe(true);

    await clicarBotao("lead-1", "conv-1");

    // DEPOIS: nada do contexto anterior orienta o próximo teste.
    expect(conversa.nina_fluxo_estado).toBeNull();
    expect(conversa.status).toBe("finished");
    expect(conversa.ai_enabled).toBe(false);
    expect(conversa.identidade_confirmada).toBe(false);
    expect(conversa.handoff_resumo).toBeNull();
    const estadoAtivo = JSON.stringify({
      leads,
      conversasAbertas: conversas.filter((c) => c.status === "open" && c.id === "conv-1"),
    });
    expect(estadoAtivo).not.toContain("neurologista");
    expect(estadoAtivo).not.toContain("João");
  });
});

// ======================================================================= F, G
describe("F/G — clique duplicado e reset durante processamento", () => {
  it("F — dois cliques seguidos produzem um único reset", async () => {
    // Duplo clique real: o segundo chega depois do primeiro terminar (a tela
    // ainda bloqueia o botão enquanto o primeiro está em andamento).
    const a = await clicarBotao("lead-1", "conv-1");
    const b = await clicarBotao("lead-1", "conv-1");
    const resets = eventos.filter((e) => e.evento === "IA_MEMORIA_RESETADA");
    expect(resets).toHaveLength(1);
    expect(leadDe("lead-1").sessao_seq).toBe(4);
    expect(a.jaResolvida).toBe(false);
    expect(b.jaResolvida).toBe(true);
  });

  it("F — clicar de novo no lead já limpo não cria sessão nem evento", async () => {
    await clicarBotao("lead-1", "conv-1");
    eventos = [];
    const r = await clicarBotao("lead-1");
    expect(r.jaResolvida).toBe(true);
    expect(r.sessao).toBe(4);
    expect(eventos).toHaveLength(0);
  });

  it("G — resposta antiga é invalidada ANTES de qualquer outra escrita", async () => {
    await clicarBotao("lead-1", "conv-1");
    // 1º a revisão da conversa sobe (torna obsoleta a resposta em voo)…
    expect(ordem[0]).toBe("revisao:conv-1");
    expect(revisoes["conv-1"]).toBe(1);
    // …depois os lotes em processamento são descartados e a trava liberada.
    expect(batches.find((b) => b.id === "b-1")!.status).toBe("SUPERSEDED");
    expect(locks.find((l) => l.id === "lk-1")!.liberado_em).not.toBeNull();
    // A resposta antiga não pode reabrir a conversa já resolvida.
    expect(conversas.find((c) => c.id === "conv-1")!.status).toBe("finished");
  });

  it("G — reset não atinge uma sessão nova já iniciada", async () => {
    // Clique tardio referenciando a conversa antiga, com o lead já em outra.
    leadDe("lead-1").conversa_id = "conv-nova";
    const r = await clicarBotao("lead-1", "conv-1");
    expect(r.jaResolvida).toBe(true);
    expect(leadDe("lead-1").conversa_id).toBe("conv-nova");
    expect(leadDe("lead-1").sessao_seq).toBe(3);
    expect(eventos).toHaveLength(0);
  });
});

// ========================================================================== D
describe("D — recarregar a página e alternar entre leads", () => {
  const ui = ler("src/components/nina/HomologacaoInbox.tsx");

  it("abrir/alternar lead apenas recarrega o que está gravado", () => {
    // Nenhum efeito de montagem/seleção chama o caminho de reset.
    expect(ui.match(/await resolver\(\{/g)?.length ?? 0).toBe(1);
    expect(ui).toContain("void carregarHistorico(leadId)");
    // A troca de lead limpa apenas o aviso visual, não a sessão.
    expect(ui).toContain("setEncerrado(null)");
  });

  it("o estado da conversa vem do servidor a cada abertura", () => {
    expect(ui).toContain("carregarHistorico");
    expect(ui).toContain("carregarLeads");
  });
});
