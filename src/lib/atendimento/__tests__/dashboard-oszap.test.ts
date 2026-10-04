import { describe, expect, it } from "bun:test";
import {
  agruparDiasDashboard,
  agrupamentosDashboard,
  extremosVolume,
  limitesAgrupamento,
  periodoAnterior,
  periodoDashboardSchema,
  periodoPadraoDashboard,
  totaisVazios,
} from "../dashboard-oszap-periodos";
import {
  resumirHistoricoDashboard,
  type MensagemHumanaDashboard,
  type EventoHistoricoDashboard,
} from "../dashboard-oszap";
import { carregarResumoDashboardOsZap, lerPaginasDashboard } from "../dashboard-oszap.server";
const periodo = { de: "2024-10-01", ate: "2024-10-01" };
const mensagem = (
  id: string,
  patch: Partial<MensagemHumanaDashboard> = {},
): MensagemHumanaDashboard => ({
  id,
  created_at: "2024-10-01T12:00:00Z",
  conversa_id: "real",
  direction: "out",
  enviada_por: "humano",
  enviada_por_user_id: "ana",
  status: "sent",
  ...patch,
});
const evento = (
  id: string,
  tipo: string,
  em = "2024-10-01T11:00:00Z",
  patch: Partial<EventoHistoricoDashboard> = {},
): EventoHistoricoDashboard => ({
  id,
  evento: tipo,
  created_at: em,
  conversa_id: "real",
  user_id: null,
  ...patch,
});
const entrada = (id: string, created_at: string, conversa_id = "real") =>
  mensagem(id, {
    created_at,
    conversa_id,
    direction: "in",
    enviada_por: null,
    enviada_por_user_id: null,
    status: "received",
  });

describe("Calendário do relatório humano", () => {
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
    expect(periodoAnterior("trimestre", "2026-10-03")).toEqual({
      de: "2026-07-01",
      ate: "2026-09-30",
    });
    expect(periodoAnterior("ano", "2026-10-03")).toEqual({ de: "2025-01-01", ate: "2025-12-31" });
    expect(limitesAgrupamento("2024-02-29", "mes")).toEqual({
      de: "2024-02-01",
      ate: "2024-02-29",
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
  it("todas as seis agregações conservam volume e resultados, incluindo dias sem movimento", () => {
    const periodo = { de: "2023-12-30", ate: "2024-03-02" };
    const dias = [
      { dia: "2023-12-31", ...totaisVazios(), recebidas: 2, total: 2, encerradas: 1 },
      { dia: "2024-02-29", ...totaisVazios(), enviadas: 3, total: 3, transferencias: 1 },
    ];
    for (const tipo of Object.keys(
      agrupamentosDashboard,
    ) as (keyof typeof agrupamentosDashboard)[]) {
      const grupos = agruparDiasDashboard(dias, periodo, tipo);
      expect(grupos.reduce((n, g) => n + g.total, 0)).toBe(5);
      expect(grupos.reduce((n, g) => n + g.dias, 0)).toBe(64);
      expect(grupos.reduce((n, g) => n + g.encerradas + g.transferencias, 0)).toBe(2);
      expect(grupos[0].de).toBe(periodo.de);
      expect(grupos.at(-1)?.ate).toBe(periodo.ate);
    }
    expect(agruparDiasDashboard([], periodo, "ano").every((g) => g.parcial)).toBe(true);
  });
  it("mínimo inclui zero, empate preserva todos e sem dados não inventa pico", () => {
    expect(extremosVolume([{ total: 0 }, { total: 0 }])).toBeNull();
    const r = extremosVolume([{ total: 2 }, { total: 0 }, { total: 2 }])!;
    expect(r.maiores).toHaveLength(2);
    expect(r.menores).toEqual([{ total: 0 }]);
  });
});
describe("Histórico humano", () => {
  it("entrada sem status ainda é recebida; saída sem vínculo não inventa conversa", () => {
    const r = resumirHistoricoDashboard(
      [
        entrada("in", "2024-10-01T11:01:00Z"),
        { ...entrada("sem-status", "2024-10-01T11:02:00Z"), status: null },
        mensagem("orfao", { conversa_id: null }),
      ],
      [evento("h", "HANDOFF_SOLICITADO")],
      periodo,
    );
    expect(r.mensagens).toMatchObject({
      recebidas: 2,
      enviadas: 1,
      total: 3,
      conversasRespondidas: 0,
    });
    expect(r.mensagens.porHora.reduce((n, h) => n + h.total, 0)).toBe(3);
    expect(r.porDia.reduce((n, d) => n + d.total, 0)).toBe(3);
  });
  it("separa entradas humanas, respostas enviadas, falhas e automações", () => {
    const r = resumirHistoricoDashboard(
      [
        entrada("in", "2024-10-01T11:01:00Z"),
        mensagem("out"),
        mensagem("read", { status: "read" }),
        mensagem("falha", { status: "failed" }),
        mensagem("pendente", { status: "pending" }),
        mensagem("nina", { enviada_por: "nina" }),
        mensagem("sistema", { enviada_por: "sistema" }),
        mensagem("aviso", { status: "system" }),
        mensagem("sem-autor", { enviada_por_user_id: null }),
      ],
      [evento("h", "HANDOFF_SOLICITADO")],
      periodo,
    );
    expect(r.mensagens).toMatchObject({
      recebidas: 1,
      enviadas: 3,
      total: 4,
      falhas: 1,
      outrosEstados: 1,
      semAutora: 1,
      conversasRespondidas: 1,
    });
    expect(r.pessoas).toEqual([{ id: "ana", mensagens: 2, encerradas: 0, transferencias: 0 }]);
    expect(r.primeiraResposta).toEqual({ mediaSeg: 3600, medidas: 1 });
  });
  it("filtro inclusivo em Brasília, não em UTC, e hora correta", () => {
    const r = resumirHistoricoDashboard(
      [
        mensagem("anterior", { created_at: "2024-10-01T02:59:59Z" }),
        mensagem("primeira", { created_at: "2024-10-01T03:00:00Z" }),
        mensagem("ultima", { created_at: "2024-10-02T02:59:59Z" }),
        mensagem("seguinte", { created_at: "2024-10-02T03:00:00Z" }),
      ],
      [],
      periodo,
    );
    expect(r.mensagens.enviadas).toBe(2);
    expect(r.porDia).toEqual([{ dia: periodo.de, ...totaisVazios(), enviadas: 2, total: 2 }]);
    expect(r.mensagens.porHora[0].enviadas).toBe(1);
    expect(r.mensagens.porHora[23].enviadas).toBe(1);
  });
  it("preserva vários encerramentos, descarta etapa automática e atribui ao supervisor real", () => {
    const es = [
      evento("h", "HANDOFF_SOLICITADO"),
      evento("p", "HANDOFF_SOLICITADO", "2024-10-01T11:01:00Z", { protocol_number: "MJ-1" }),
      evento("f1", "FINALIZADA", "2024-10-01T12:30:00Z", { user_id: "supervisor" }),
      evento("reabriu", "REABERTA", "2024-10-01T13:00:00Z"),
      evento("a2", "ASSUMIDA", "2024-10-01T14:00:00Z", { user_id: "ana" }),
      evento("f2", "FINALIZADA", "2024-10-01T15:00:00Z", { user_id: "ana" }),
      evento("auto", "FINALIZADA", "2024-10-01T16:00:00Z", { user_id: "ana", automatico: true }),
    ];
    const r = resumirHistoricoDashboard(
      [
        entrada("in1", "2024-10-01T11:02:00Z"),
        entrada("auto", "2024-10-01T13:30:00Z"),
        entrada("in2", "2024-10-01T14:01:00Z"),
      ],
      [...es, es[2]],
      periodo,
    );
    expect(r.mensagens.recebidas).toBe(2);
    expect(r.mensagens.recebidasForaEtapaHumana).toBe(1);
    expect(r.encerramentos).toEqual({ total: 2, duracaoMediaSeg: 4500, duracoesMedidas: 2 });
    expect(r.pessoas.find((p) => p.id === "supervisor")?.encerradas).toBe(1);
  });
  it("carrega o ciclo anterior à data, sem chamar resposta repetida de primeira", () => {
    const r = resumirHistoricoDashboard(
      [
        mensagem("anterior", { created_at: "2024-09-30T23:10:00Z" }),
        mensagem("atual"),
        entrada("in", "2024-10-01T03:00:00Z"),
      ],
      [evento("h", "HANDOFF_SOLICITADO", "2024-09-30T23:00:00Z")],
      periodo,
    );
    expect(r.mensagens.enviadas).toBe(1);
    expect(r.mensagens.recebidas).toBe(1);
    expect(r.primeiraResposta).toEqual({ mediaSeg: null, medidas: 0 });
  });
  it("aviso de protocolo não abre etapa e falta de histórico não vira atendimento humano", () => {
    const r = resumirHistoricoDashboard(
      [entrada("sem", "2024-10-01T12:00:00Z"), mensagem("humana")],
      [
        evento("p", "ASSUMIDA", undefined, {
          user_id: "ana",
          protocol_number: "MJ-1",
          protocolo_informado: true,
        }),
      ],
      periodo,
    );
    expect(r.mensagens.recebidas).toBe(0);
    expect(r.mensagens.recebidasSemHistorico).toBe(1);
    expect(r.mensagens.enviadas).toBe(1);
    expect(r.primeiraResposta.mediaSeg).toBeNull();
  });
  it("transferência mantém o ciclo e devolução o encerra; não duplica por ID", () => {
    const m = entrada("in", "2024-10-01T12:00:00Z");
    const r = resumirHistoricoDashboard(
      [m, m, entrada("fora", "2024-10-01T14:00:00Z")],
      [
        evento("a", "ASSUMIDA", undefined, { user_id: "ana" }),
        evento("t", "TRANSFERIDA", "2024-10-01T11:30:00Z", { user_id: "supervisor" }),
        evento("fim", "DEVOLVIDA_PARA_IA", "2024-10-01T13:00:00Z"),
      ],
      periodo,
    );
    expect(r.mensagens.recebidas).toBe(1);
    expect(r.transferencias.total).toBe(1);
  });
});
describe("Consulta histórica", () => {
  it("não trunca volume anual em 20 mil registros; falha não devolve total parcial", async () => {
    const r = await lerPaginasDashboard(async (de, ate) => ({
      data: Array.from({ length: Math.max(0, Math.min(ate + 1, 21005) - de) }, (_, i) => de + i),
      error: null,
    }));
    expect(r).toHaveLength(21005);
    expect(r.at(-1)).toBe(21004);
    await expect(
      lerPaginasDashboard(async (de) =>
        de
          ? { data: null, error: { message: "falhou" } }
          : { data: Array.from({ length: 1000 }), error: null },
      ),
    ).rejects.toThrow("todo o histórico");
  });
  it("autoriza antes de consultar e usa fontes históricas, clínica e ambiente real", async () => {
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
          order() {
            return q;
          },
          range() {
            return q;
          },
          then(resolve: any, reject: any) {
            let data: unknown[] = [];
            if (tabela === "whatsapp_mensagens" && !c.filtros.some(([k]) => k === "direction"))
              data = [mensagem("m")];
            if (tabela === "atend_conversa_eventos")
              data = c.filtros.some(([k]) => k === "conversa_id")
                ? [
                    evento("h", "HANDOFF_SOLICITADO"),
                    evento("f", "FINALIZADA", "2024-10-01T13:00:00Z", { user_id: "supervisor" }),
                  ]
                : [evento("f", "FINALIZADA", "2024-10-01T13:00:00Z", { user_id: "supervisor" })];
            if (tabela === "profiles")
              data = [
                { id: "ana", nome: "Ana" },
                { id: "supervisor", nome: "Supervisão" },
              ];
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          },
        };
        for (const metodo of ["eq", "neq", "not", "gte", "lt", "in", "or"])
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
    expect(r.mensagens.enviadas).toBe(1);
    expect(r.encerramentos.total).toBe(1);
    expect(r.pessoas.find((p) => p.id === "supervisor")?.nome).toBe("Supervisão");
    for (const c of consultas) {
      expect(c.tabela).not.toMatch(/presenca|nina_|transferencias/);
      expect(c.campos).not.toMatch(/body|raw|motivo|telefone|resolved_at|primeiro_resp/);
      if (c.tabela !== "profiles") expect(c.filtros).toContainEqual(["clinica_id", "clinica"]);
      if (c.tabela === "whatsapp_mensagens") expect(c.filtros).toContainEqual(["is_teste", false]);
      if (c.tabela === "atend_conversa_eventos")
        expect(c.filtros).toContainEqual(["atend_conversas.is_teste", false]);
    }
    expect(
      consultas.some((c) =>
        c.filtros.some(([k, v]) => k === "created_at" && v === "2024-10-02T03:00:00.000Z"),
      ),
    ).toBe(true);
  });
});
