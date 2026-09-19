import { describe, expect, test } from "bun:test";
import { atualizarCronometroPausa, formatarTempoPausa } from "../cronometro-pausa";
import { consultarInicioCronometroPausa, lerInicioCronometroPausa } from "../cronometro-pausa.server";
import { aplicarAtualizacao, SINCRONIA_INICIAL } from "../presenca-sync";

const escopo = { clinicaId: "clinica-a", userId: "atendente-a" };
const t0 = "2026-09-17T14:00:00.000Z";
const t1 = "2026-09-17T14:20:00.000Z";
const t2 = "2026-09-17T15:00:00.000Z";

type Linha = { clinica_id: string; user_id: string; estado: string; versao: number; created_at: string };
function banco(linhas: Linha[]) {
  let leituras = 0;
  return {
    get leituras() { return leituras; },
    from(tabela: string) {
      expect(tabela).toBe("atend_presenca_manual_log");
      leituras++;
      let dados = [...linhas];
      const query = {
        select: (_campos: string) => query,
        eq: (campo: keyof Linha, valor: unknown) => { dados = dados.filter(l => l[campo] === valor); return query; },
        in: (campo: keyof Linha, valores: unknown[]) => { dados = dados.filter(l => valores.includes(l[campo])); return query; },
        lte: (_campo: string, valor: number) => { dados = dados.filter(l => l.versao <= valor); return query; },
        gt: (_campo: string, valor: number) => { dados = dados.filter(l => l.versao > valor); return query; },
        order: (_campo: string, op: { ascending: boolean }) => { dados.sort((a, b) => op.ascending ? a.versao - b.versao : b.versao - a.versao); return query; },
        limit: (n: number) => { dados = dados.slice(0, n); return query; },
        maybeSingle: async () => ({ data: dados[0] ?? null, error: null }),
      };
      return query;
    },
  };
}
const linha = (estado: string, versao: number, created_at: string): Linha => ({
  clinica_id: escopo.clinicaId, user_id: escopo.userId, estado, versao, created_at,
});
const historico = [
  linha("ONLINE", 1, "2026-09-17T13:00:00.000Z"),
  linha("PAUSA", 2, t0), linha("PAUSA", 3, t1), linha("OFFLINE", 4, t1),
  linha("PAUSA", 5, t1), linha("ONLINE", 6, t2), linha("PAUSA", 7, t2),
];

describe("cronômetro: Online e Offline encerram o período", () => {
  test("Pausa repetida conserva o início; Offline zera e a próxima pausa começa do zero", () => {
    const inicial = atualizarCronometroPausa(null, { ...escopo, estado: "PAUSA", versao: 2, em: t0 });
    const repetida = atualizarCronometroPausa(inicial, { ...escopo, estado: "PAUSA", versao: 3, em: t1 });
    const offline = atualizarCronometroPausa(repetida, { ...escopo, estado: "OFFLINE", versao: 4, em: t1 });
    expect(repetida.inicio).toBe(t0);
    expect(offline.inicio).toBeNull();
    expect(atualizarCronometroPausa(offline, { ...escopo, estado: "PAUSA", versao: 5, em: t2 }).inicio).toBe(t2);
  });

  test("reload e outra aba em Offline descartam até um início de pausa antigo", () => {
    const entrada = { ...escopo, estado: "OFFLINE" as const, versao: 4, em: t1, cronometroPausaInicio: t0 };
    const sincronia = aplicarAtualizacao(SINCRONIA_INICIAL, escopo, entrada);
    expect(sincronia.aceita).toBe(true);
    expect(atualizarCronometroPausa(null, entrada).inicio).toBeNull();
  });

  test.each(["ONLINE", "OFFLINE"] as const)("resposta atrasada não reabre contador depois de %s", (estado) => {
    const anterior = atualizarCronometroPausa(null, { ...escopo, estado: "PAUSA", versao: 2, em: t0 });
    const encerrado = atualizarCronometroPausa(anterior, { ...escopo, estado, versao: 6, em: t1 });
    expect(encerrado.inicio).toBeNull();
    expect(atualizarCronometroPausa(encerrado, { ...escopo, estado: "PAUSA", versao: 3, em: t0 }).inicio).toBeNull();
    expect(atualizarCronometroPausa(encerrado, { ...escopo, estado: "PAUSA", versao: 7, em: t2 }).inicio).toBe(t2);
  });

  test("trocar clínica ou usuário não reaproveita o relógio anterior", () => {
    const anterior = atualizarCronometroPausa(null, { ...escopo, estado: "PAUSA", versao: 9, em: t0 });
    expect(atualizarCronometroPausa(anterior, { ...escopo, clinicaId: "clinica-b", estado: "OFFLINE", versao: 1 }).inicio).toBeNull();
    expect(atualizarCronometroPausa(anterior, { ...escopo, userId: "outra", estado: "PAUSA", versao: 1, em: t2 }).inicio).toBe(t2);
  });

  test("relógio mede tempo decorrido, sem perder segundos de uma aba suspensa", () => {
    expect(formatarTempoPausa(t0, Date.parse(t0))).toBe("00:00:00");
    expect(formatarTempoPausa(t0, Date.parse(t0) + 3_661_000)).toBe("01:01:01");
    expect(formatarTempoPausa(t0, Date.parse(t0) + 90_061_000)).toBe("25:01:01");
    expect(formatarTempoPausa(t0, Date.parse(t0) - 1000)).toBe("00:00:00");
  });
});

describe("início persistido no histórico do servidor", () => {
  test("snapshot anterior ignora encerramentos futuros e cliques repetidos em Pausa", async () => {
    for (const [versao, estado] of [[2, "PAUSA"], [3, "PAUSA"]] as const) {
      expect(await consultarInicioCronometroPausa(banco(historico) as any, { ...escopo, estado, versao })).toBe(t0);
    }
  });

  test("Offline encerra sem consultar histórico; pausa seguinte tem novo início oficial", async () => {
    const db = banco(historico);
    expect(await consultarInicioCronometroPausa(db as any, { ...escopo, estado: "OFFLINE", versao: 4 })).toBeNull();
    expect(db.leituras).toBe(0);
    const inicio = await consultarInicioCronometroPausa(db as any, { ...escopo, estado: "PAUSA", versao: 5 });
    expect(inicio).toBe(t1);
    const recarregado = atualizarCronometroPausa(null, { ...escopo, estado: "PAUSA", versao: 5, cronometroPausaInicio: inicio });
    expect(formatarTempoPausa(recarregado.inicio!, Date.parse(t1))).toBe("00:00:00");
  });

  test("Online zera e uma pausa seguinte cria um novo período", async () => {
    const db = banco(historico);
    expect(await consultarInicioCronometroPausa(db as any, { ...escopo, estado: "ONLINE", versao: 6 })).toBeNull();
    expect(db.leituras).toBe(0);
    expect(await consultarInicioCronometroPausa(db as any, { ...escopo, estado: "PAUSA", versao: 7 })).toBe(t2);
  });

  test("sem pausa anterior, Offline não cria um contador", async () => {
    expect(await consultarInicioCronometroPausa(banco([linha("OFFLINE", 1, t0)]) as any,
      { ...escopo, estado: "OFFLINE", versao: 1 })).toBeNull();
  });

  test("leitura fica restrita à clínica e ao usuário autenticado", async () => {
    const linhas = [...historico,
      { ...linha("OFFLINE", 3, t1), clinica_id: "clinica-b" },
      { ...linha("ONLINE", 3, t1), user_id: "outra" },
    ];
    expect(await consultarInicioCronometroPausa(banco(linhas) as any, { ...escopo, estado: "PAUSA", versao: 3 })).toBe(t0);
  });

  test("muitos cliques não truncam o início do período", async () => {
    const longo = [linha("PAUSA", 1, t0), ...Array.from({ length: 1100 }, (_, i) => linha("PAUSA", i + 2, t1))];
    expect(await consultarInicioCronometroPausa(banco(longo) as any, { ...escopo, estado: "PAUSA", versao: 1101 })).toBe(t0);
  });

  test("falha na leitura não apaga a contagem nem transforma pausa salva em falha", async () => {
    const db = { from: () => { throw new Error("Sem conexão"); } };
    const inicio = await lerInicioCronometroPausa(db as any, { ...escopo, estado: "PAUSA", versao: 3 });
    expect(inicio).toBeUndefined();
    const anterior = atualizarCronometroPausa(null, { ...escopo, estado: "PAUSA", versao: 2, em: t0 });
    expect(atualizarCronometroPausa(anterior, { ...escopo, estado: "PAUSA", versao: 3, cronometroPausaInicio: inicio }).inicio).toBe(t0);
    expect(atualizarCronometroPausa(anterior, { ...escopo, estado: "OFFLINE", versao: 4, cronometroPausaInicio: inicio }).inicio).toBeNull();
    expect(await lerInicioCronometroPausa(db as any, { ...escopo, estado: "OFFLINE", versao: 4 })).toBeNull();
  });
});
