import { describe, expect, test } from "bun:test";
import { LIMITES_JEV_PADRAO, casosAcima, normalizarLimites, relatorioCalibragem } from "../jev-limites";
import { decidirEncaminhamento } from "../jev-encaminhamento";
import { problemasConferencia } from "../jev-conferencia";

describe("Jev Etapa C — limites e calibragem", () => {
  test("sem configuração ou valor fora da faixa vale o padrão", () => {
    expect(normalizarLimites(null)).toEqual(LIMITES_JEV_PADRAO);
    expect(normalizarLimites({ urgencia: 0.1, irritacao: 0.99, pedido_atendente: 0.6 }).urgencia).toBe(0.5);
    expect(normalizarLimites({ pedido_atendente: "0.6" }).pedido_atendente).toBe(0.6);
  });
  test("limite da clínica muda a transferência", () => {
    const r = { irritacao: { noul: 0.65 } };
    expect(decidirEncaminhamento(r, null)).toBeNull();
    expect(decidirEncaminhamento(r, null, { urgencia: 0.5, pedido_atendente: 0.7, irritacao: 0.6 })?.motivo).toContain("IRRITACAO");
  });
  test("limite da conferência é respeitado", () => {
    const f = { agendaConsultada: false, agendamentoConfirmado: false, dadosConsultados: [] };
    expect(problemasConferencia({ cancelamento: { noul: 0.6 } }, f)).toEqual([]);
    expect(problemasConferencia({ cancelamento: { noul: 0.6 } }, f, 0.5)).toEqual(["cancelamento"]);
  });
  test("relatório conta por faixa e simula limite", () => {
    const rel = relatorioCalibragem([{ urgencia: { noul: 0.55 } }, { urgencia: { noul: 0.05 } }, null, { urgencia: { noul: 1 } }]);
    const u = rel.find((x) => x.sinal === "urgencia")!;
    expect(u.total).toBe(3);
    expect(u.faixas[5]!.casos).toBe(1);
    expect(u.faixas[9]!.casos).toBe(1);
    expect(casosAcima(u, 0.5)).toBe(2);
  });
});
