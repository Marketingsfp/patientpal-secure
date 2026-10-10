import { describe, expect, it } from "bun:test";
import {
  agruparDiasDashboard,
  agrupamentosDashboard,
  limitesAgrupamento,
  periodoAnterior,
  periodoComparacao,
  periodoDashboardSchema,
  periodoPadraoDashboard,
} from "../dashboard-oszap-periodos";
import {
  diaVazio,
  montarDashboardOsZap,
  type EntradaDashboard,
  type EventoDashboard,
  type MensagemDashboard,
} from "../dashboard-oszap";
import { carregarResumoDashboardOsZap, lerPaginasDashboard } from "../dashboard-oszap.server";

const periodo = { de: "2024-10-01", ate: "2024-10-01" };
const agora = new Date("2024-10-02T12:00:00Z");
const mensagem = (id: string, patch: Partial<MensagemDashboard> = {}): MensagemDashboard => ({
  id,
  created_at: "2024-10-01T12:00:00Z",
  conversa_id: "real",
  direction: "out",
  enviada_por: "humano",
  enviada_por_user_id: "ana",
  status: "sent",
  ...patch,
});
const entrada = (id: string, created_at: string, conversa_id = "real") =>
  mensagem(id, {
    created_at,
    conversa_id,
    direction: "in",
    enviada_por: "paciente",
    enviada_por_user_id: null,
    status: "received",
  });
const evento = (
  id: string,
  tipo: string,
  em = "2024-10-01T11:00:00Z",
  patch: Partial<EventoDashboard> = {},
): EventoDashboard => ({
  id,
  evento: tipo,
  created_at: em,
  conversa_id: "real",
  user_id: null,
  ...patch,
});
const base = (patch: Partial<EntradaDashboard> = {}): EntradaDashboard => ({
  periodo,
  agora,
  abertas: [],
  criadas: [],
  mensagens: [],
  eventos: [],
  seguintes: { eventos: [], mensagens: [] },
  avaliacoes: [],
  transferencias: [],
  departamentos: [],
  presencas: [],
  pausas: [],
  motivosPausa: [],
  nomes: new Map(),
  nina: [],
  francisco: [],
  webhook: [],
  ...patch,
});

describe("Calendário do dashboard", () => {
  it("abre nos últimos 30 dias completos e oferece períodos anteriores civis", () => {
    expect(periodoPadraoDashboard("2026-01-03")).toEqual({ de: "2025-12-04", ate: "2026-01-02" });
    expect(periodoAnterior("semana", "2026-10-03")).toEqual({
      de: "2026-09-21",
      ate: "2026-09-27",
    });
    expect(periodoAnterior("bimestre", "2026-01-03")).toEqual({
      de: "2025-11-01",
      ate: "2025-12-31",
    });
    expect(periodoAnterior("ano", "2026-10-03")).toEqual({ de: "2025-01-01", ate: "2025-12-31" });
    expect(limitesAgrupamento("2024-02-29", "mes")).toEqual({
      de: "2024-02-01",
      ate: "2024-02-29",
    });
  });
  it("compara com o período anterior de mesmo tamanho", () => {
    expect(periodoComparacao({ de: "2024-03-01", ate: "2024-03-31" })).toEqual({
      de: "2024-01-30",
      ate: "2024-02-29",
    });
    expect(periodoComparacao({ de: "2024-10-01", ate: "2024-10-01" })).toEqual({
      de: "2024-09-30",
      ate: "2024-09-30",
    });
  });
  it("rejeita datas inválidas, invertidas e futuras", () => {
    for (const p of [
      { de: "2024-02-30", ate: "2024-03-01" },
      { de: "2024-10-02", ate: "2024-10-01" },
      { de: "2999-01-01", ate: "2999-02-01" },
    ])
      expect(periodoDashboardSchema.safeParse(p).success).toBe(false);
  });
  it("todas as agregações conservam os totais, incluindo dias sem movimento", () => {
    const p = { de: "2023-12-30", ate: "2024-03-02" };
    const dias = [
      { dia: "2023-12-31", ...diaVazio(), recebidas: 2, finalizadas: 1 },
      { dia: "2024-02-29", ...diaVazio(), respostasEquipe: 3, transferencias: 1 },
    ];
    for (const tipo of Object.keys(
      agrupamentosDashboard,
    ) as (keyof typeof agrupamentosDashboard)[]) {
      const grupos = agruparDiasDashboard(dias, p, tipo, diaVazio);
      expect(grupos.reduce((n, g) => n + g.recebidas + g.respostasEquipe, 0)).toBe(5);
      expect(grupos.reduce((n, g) => n + g.dias, 0)).toBe(64);
      expect(grupos.reduce((n, g) => n + g.finalizadas + g.transferencias, 0)).toBe(2);
      expect(grupos[0].de).toBe(p.de);
      expect(grupos.at(-1)?.ate).toBe(p.ate);
    }
    expect(agruparDiasDashboard([], p, "ano", diaVazio).every((g) => g.parcial)).toBe(true);
  });
});

describe("Números do dashboard", () => {
  it("separa respostas da equipe e da Nina; só conta envio confirmado", () => {
    const r = montarDashboardOsZap(
      base({
        mensagens: [
          entrada("in", "2024-10-01T11:01:00Z"),
          mensagem("equipe"),
          mensagem("lida", { status: "read" }),
          mensagem("falhou", { status: "failed" }),
          mensagem("nina", { enviada_por: "nina", enviada_por_user_id: null }),
          mensagem("aviso", { enviada_por: "sistema", enviada_por_user_id: null }),
        ],
      }),
    );
    expect(r.indicadores.mensagensRecebidas.atual).toBe(1);
    expect(r.indicadores.respostasEquipe.atual).toBe(2);
    expect(r.indicadores.respostasNina.atual).toBe(1);
    expect(r.indicadores.conversasRespondidas.atual).toBe(1);
    expect(r.whatsapp.enviosFalha).toBe(1);
    expect(r.equipe.find((p) => p.id === "ana")?.mensagens).toBe(2);
  });
  it("compara com o período anterior e ignora o que está fora das duas janelas", () => {
    const r = montarDashboardOsZap(
      base({
        mensagens: [
          entrada("hoje", "2024-10-01T15:00:00Z"),
          entrada("ontem", "2024-09-30T15:00:00Z"),
          entrada("ontem2", "2024-09-30T16:00:00Z"),
          entrada("antes", "2024-09-20T15:00:00Z"),
        ],
      }),
    );
    expect(r.indicadores.mensagensRecebidas).toEqual({ atual: 1, anterior: 2 });
    expect(r.porDia).toHaveLength(1);
    expect(r.porDia[0].recebidas).toBe(1);
  });
  it("usa o horário de Brasília para dia, hora e dia da semana", () => {
    // 02:30 UTC de 02/10 = 23:30 de terça, 01/10, em Brasília
    const r = montarDashboardOsZap(base({ mensagens: [entrada("noite", "2024-10-02T02:30:00Z")] }));
    expect(r.porDia[0]).toMatchObject({ dia: "2024-10-01", recebidas: 1 });
    expect(r.porHora.find((h) => h.recebidas)).toMatchObject({ diaSemana: 2, hora: 23 });
  });
  it("mede espera, 1ª resposta e tempo até encerrar, inclusive quando terminam depois do período", () => {
    const r = montarDashboardOsZap(
      base({
        eventos: [
          evento("fila", "ENTROU_NA_FILA", "2024-10-01T12:00:00Z"),
          evento("assumiu", "ASSUMIDA", "2024-10-01T12:10:00Z", { user_id: "ana" }),
        ],
        mensagens: [mensagem("resp", { created_at: "2024-10-01T12:20:00Z" })],
        seguintes: {
          eventos: [evento("fim", "FINALIZADA", "2024-10-02T13:10:00Z", { user_id: "ana" })],
          mensagens: [],
        },
      }),
    );
    expect(r.indicadores.esperaFilaMin.atual).toBe(10);
    expect(r.indicadores.primeiraRespostaMin.atual).toBe(20);
    expect(r.indicadores.tempoAteEncerrarMin.atual).toBe(25 * 60);
    expect(r.indicadores.finalizadas.atual).toBe(0);
    expect(r.equipe.find((p) => p.id === "ana")).toMatchObject({ assumidas: 1, finalizadas: 0 });
  });
  it("atribui ações a quem executou e mostra a situação de agora", () => {
    const r = montarDashboardOsZap(
      base({
        eventos: [
          evento("f", "FINALIZADA", "2024-10-01T13:00:00Z", { user_id: "supervisor" }),
          evento("t", "TRANSFERIDA", "2024-10-01T13:00:00Z", { user_id: "ana" }),
          evento("h", "HANDOFF_SOLICITADO"),
        ],
        abertas: [
          {
            id: "c1",
            created_at: "2024-10-02T11:00:00Z",
            status: "waiting",
            departamento_id: null,
            atribuida_user_id: null,
            awaiting_patient_since: null,
            aguardando_desde: "2024-10-02T11:30:00Z",
            inbox_entrada_em: null,
            assigned_at: null,
            ultima_msg_em: null,
            unread_count: 2,
            sentimento: null,
          },
        ],
        presencas: [{ user_id: "ana", status: "ONLINE", estado_manual: "PAUSA" }],
        nomes: new Map([["supervisor", "Supervisão"]]),
      }),
    );
    expect(r.equipe.find((p) => p.id === "supervisor")).toMatchObject({
      nome: "Supervisão",
      finalizadas: 1,
    });
    expect(r.equipe.find((p) => p.id === "ana")).toMatchObject({
      transferencias: 1,
      presenca: "Em pausa",
    });
    expect(r.agora.fila).toEqual({ conversas: 1, naoLidas: 2, esperaMaxMin: 30 });
    expect(r.departamentos.find((d) => d.id === "sem")?.naFila).toBe(1);
    expect(r.indicadores.encaminhadas.atual).toBe(1);
  });
  it("resume Nina, Francisco e avisos da Meta; seção indisponível fica nula", () => {
    const exec = (patch = {}) => ({
      created_at: "2024-10-01T12:00:00Z",
      conversation_id: "real",
      success: true,
      handoff: false,
      latency_ms: 4000,
      input_tokens: 30000,
      output_tokens: 200,
      model: "modelo-a",
      perfil: "whatsapp",
      error_category: null,
      ...patch,
    });
    const r = montarDashboardOsZap(
      base({
        nina: [exec(), exec({ success: false, error_category: "timeout", latency_ms: 6000 })],
        francisco: [
          { etapa: "d1", status: "enviado", respondido_em: "2024-10-01T13:00:00Z" },
          { etapa: "d1", status: "enviado", respondido_em: null },
          { etapa: "d4", status: "bloqueado", respondido_em: null },
        ],
        webhook: [
          { recebido_em: "2024-10-01T12:00:00Z", resultado: "processado_ok" },
          { recebido_em: "2024-10-01T12:00:00Z", resultado: "assinatura_invalida" },
          { recebido_em: "2024-10-01T12:00:00Z", resultado: "pendente: conversa ocupada" },
        ],
      }),
    );
    expect(r.nina).toMatchObject({ execucoes: 2, falhas: 1, latenciaMediaS: 5, conversas: 1 });
    expect(r.nina?.erros).toEqual([{ categoria: "timeout", falhas: 1 }]);
    expect(r.francisco?.[0]).toMatchObject({ enviados: 2, respondidos: 1, taxaResposta: 0.5 });
    expect(r.francisco?.[1]).toMatchObject({ bloqueados: 1, taxaResposta: null });
    expect(r.whatsapp).toMatchObject({ processados: 1, assinaturaInvalida: 1, pendentes: 1 });
    const sem = montarDashboardOsZap(base({ nina: null, francisco: null, webhook: null }));
    expect(sem.nina).toBeNull();
    expect(sem.francisco).toBeNull();
    expect(sem.whatsapp.avisosDisponiveis).toBe(false);
  });
});

describe("Consulta do dashboard", () => {
  it("não trunca volume anual em 20 mil registros; falha não devolve total parcial", async () => {
    const r = await lerPaginasDashboard(async (de, ate) => ({
      data: Array.from({ length: Math.max(0, Math.min(ate + 1, 21005) - de) }, (_, i) => de + i),
      error: null,
    }));
    expect(r).toHaveLength(21005);
    await expect(
      lerPaginasDashboard(async (de) =>
        de
          ? { data: null, error: { message: "falhou" } }
          : { data: Array.from({ length: 1000 }), error: null },
      ),
    ).rejects.toThrow("todo o histórico");
  });
  it("autoriza antes de consultar, filtra clínica e testes e não lê conteúdo", async () => {
    const consultas: { tabela: string; campos: string; filtros: [string, unknown][] }[] = [];
    let permitido = false;
    const db = {
      rpc: async () => ({ data: permitido, error: null }),
      from(tabela: string) {
        const c = { tabela, campos: "", filtros: [] as [string, unknown][] };
        consultas.push(c);
        const q: any = {
          select(campos: string) {
            c.campos = campos;
            return q;
          },
          order: () => q,
          range: () => q,
          then(resolve: any, reject: any) {
            let data: unknown[] = [];
            let error: unknown = null;
            const posterior = c.filtros.some(
              ([k, v]) =>
                k === "created_at" &&
                v === "2024-10-02T03:00:00.000Z" &&
                c.filtros.some(([k2]) => k2 === "conversa_id"),
            );
            if (tabela === "whatsapp_mensagens" && !posterior)
              data = [mensagem("m"), entrada("e", "2024-10-01T11:30:00Z")];
            if (tabela === "atend_conversa_eventos" && !posterior)
              data = [evento("f", "FINALIZADA", "2024-10-01T13:00:00Z", { user_id: "supervisor" })];
            if (tabela === "nina_execucoes")
              data = [
                {
                  created_at: "2024-10-01T12:00:00Z",
                  conversation_id: "real",
                  success: true,
                  handoff: false,
                  latency_ms: 1000,
                  input_tokens: 1,
                  output_tokens: 1,
                  model: "m",
                  perfil: "whatsapp",
                  error_category: null,
                },
              ];
            if (tabela === "francisco_envios") error = { message: "sem permissão" };
            if (tabela === "profiles") data = [{ id: "supervisor", nome: "Supervisão" }];
            return Promise.resolve({ data: error ? null : data, error }).then(resolve, reject);
          },
        };
        for (const metodo of ["eq", "neq", "not", "gte", "gt", "lt", "in", "or", "is"])
          q[metodo] = (k: string, v: unknown) => {
            c.filtros.push([k, v]);
            return q;
          };
        return q;
      },
    };
    await expect(
      carregarResumoDashboardOsZap(db as any, "user", "clinica", periodo),
    ).rejects.toThrow("administração e supervisão");
    expect(consultas).toHaveLength(0);
    permitido = true;
    const r = await carregarResumoDashboardOsZap(db as any, "user", "clinica", periodo);
    expect(r.indicadores.respostasEquipe.atual).toBe(1);
    expect(r.indicadores.finalizadas.atual).toBe(1);
    expect(r.equipe.find((p) => p.id === "supervisor")?.nome).toBe("Supervisão");
    expect(r.nina?.execucoes).toBe(1);
    expect(r.francisco).toBeNull();
    expect(r.avisos.join(" ")).toContain("Francisco");
    for (const c of consultas) {
      expect(c.campos).not.toMatch(
        /body|raw|corpo|headers|motivo|telefone|texto|resumo|transcricao/,
      );
      if (c.tabela !== "profiles") expect(c.filtros).toContainEqual(["clinica_id", "clinica"]);
      if (["whatsapp_mensagens", "atend_conversas"].includes(c.tabela))
        expect(c.filtros).toContainEqual(["is_teste", false]);
      if (["atend_conversa_eventos", "atend_avaliacoes", "atend_transferencias"].includes(c.tabela))
        expect(c.filtros).toContainEqual(["atend_conversas.is_teste", false]);
      // Nina: só execuções das conversas reais com mensagens no período
      if (c.tabela === "nina_execucoes")
        expect(c.filtros).toContainEqual(["conversation_id", ["real"]]);
    }
  });
});
