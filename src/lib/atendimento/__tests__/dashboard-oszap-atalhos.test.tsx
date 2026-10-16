import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardOsZapView } from "@/components/nina/DashboardOsZapView";
import { periodoAtual, periodoInicialDashboard } from "../dashboard-oszap-periodos";

// 16/10/2026: o dashboard abre em "Hoje" e tem atalhos do período em andamento.
describe("atalhos do período atual", () => {
  it("abre no dia de hoje, até agora", () => {
    expect(periodoInicialDashboard("2026-10-16")).toEqual({ de: "2026-10-16", ate: "2026-10-16" });
  });

  it("semana começa na segunda; mês e ano começam no dia 1; todos vão até hoje", () => {
    // 16/10/2026 é sexta-feira.
    expect(periodoAtual("semana", "2026-10-16")).toEqual({ de: "2026-10-12", ate: "2026-10-16" });
    expect(periodoAtual("semana", "2026-10-12")).toEqual({ de: "2026-10-12", ate: "2026-10-12" });
    expect(periodoAtual("semana", "2026-10-18")).toEqual({ de: "2026-10-12", ate: "2026-10-18" });
    expect(periodoAtual("mes", "2026-10-16")).toEqual({ de: "2026-10-01", ate: "2026-10-16" });
    expect(periodoAtual("ano", "2026-10-16")).toEqual({ de: "2026-01-01", ate: "2026-10-16" });
  });

  it("a tela abre com Hoje escolhido e oferece semana, mês e ano em andamento", () => {
    const html = renderToStaticMarkup(
      <DashboardOsZapView
        periodo={periodoInicialDashboard()}
        agrupamento="dia"
        onAgrupamento={() => {}}
        consultar={() => {}}
        clinica="Clínica de teste"
        atualizando={false}
      />,
    );
    expect(html).toMatch(/<option value="hoje" selected="">Hoje<\/option>/);
    for (const rotulo of [
      "Esta semana (até agora)",
      "Este mês (até agora)",
      "Este ano (até agora)",
      "Últimos 30 dias completos",
    ])
      expect(html).toContain(rotulo);
  });
});
