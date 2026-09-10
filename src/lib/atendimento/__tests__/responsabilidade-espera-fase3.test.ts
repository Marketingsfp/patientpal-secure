import { describe, expect, it } from "bun:test";
import {
  filtroResponsavel,
  idsPorEsperaCrescente,
  ordenarPorEspera,
  planoVisualizacao,
} from "../filtros-inbox";

const JEAN = "11111111-1111-1111-1111-111111111111";

describe("FASE 3 — responsabilidade da conversa resolvida", () => {
  it("conversa ativa usa o responsável atual", () => {
    const f = filtroResponsavel(JEAN, planoVisualizacao("recentes"));
    expect(f).toEqual({ tipo: "coluna", coluna: "atribuida_user_id", userId: JEAN });
  });

  it("resolvida usa responsável do momento da resolução, com fallback em quem resolveu", () => {
    const f = filtroResponsavel(JEAN, planoVisualizacao("resolvidas"));
    expect(f.tipo).toBe("ou");
    if (f.tipo !== "ou") throw new Error("filtro inesperado");
    expect(f.expr).toBe(`last_assigned_user_id.eq.${JEAN},resolved_by.eq.${JEAN}`);
    // Nunca volta a olhar a atribuição ativa, que é limpa no encerramento.
    expect(f.expr).not.toContain("atribuida_user_id");
  });

  it("maior espera continua olhando o responsável atual", () => {
    expect(filtroResponsavel(JEAN, planoVisualizacao("espera")).tipo).toBe("coluna");
  });
});

describe("FASE 3 — tempo de espera do paciente", () => {
  // A = paciente esperando há 2h, B = há 10min, C = clínica aguardando o
  // paciente (fora da métrica canônica, portanto ausente do mapa).
  const agora = Date.parse("2026-09-10T12:00:00.000Z");
  const mapa = {
    A: new Date(agora - 2 * 60 * 60 * 1000).toISOString(),
    B: new Date(agora - 10 * 60 * 1000).toISOString(),
  };

  it("ordena do que espera há mais tempo para o mais recente", () => {
    expect(idsPorEsperaCrescente(mapa)).toEqual(["A", "B"]);
    expect(ordenarPorEspera([{ id: "B" }, { id: "A" }], mapa).map((r) => r.id)).toEqual(["A", "B"]);
  });

  it("conversa aguardando resposta do paciente não entra como espera", () => {
    expect(idsPorEsperaCrescente(mapa)).not.toContain("C");
    // Se ainda assim chegar uma linha sem métrica, ela vai para o fim.
    const ordenado = ordenarPorEspera([{ id: "C" }, { id: "B" }, { id: "A" }], mapa);
    expect(ordenado.map((r) => r.id)).toEqual(["A", "B", "C"]);
  });

  it("plano de espera não mistura conversa antiga com paciente aguardando", () => {
    const p = planoVisualizacao("espera");
    expect(p.exigeEsperaPaciente).toBe(true);
    expect(p.somenteResolvidas).toBe(false);
    expect(p.ascendente).toBe(true);
  });
});
