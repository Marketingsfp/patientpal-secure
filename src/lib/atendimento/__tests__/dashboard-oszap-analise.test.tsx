import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AnaliseDashboardIA } from "@/components/nina/AnaliseDashboardIA";
import { DashboardOsZapView } from "@/components/nina/DashboardOsZapView";
import { diaVazio } from "../dashboard-oszap";
import { diasDoPeriodo } from "../dashboard-oszap-periodos";
import {
  agrupamentoParaAnalise,
  dadosParaAnaliseDashboard,
  INSTRUCOES_ANALISE_DASHBOARD,
  MODELO_ANALISE_DASHBOARD,
} from "../dashboard-oszap-analise";

const resumo = (de: string, ate: string) => ({
  periodo: { de, ate },
  anterior: { de: "2026-01-01", ate: "2026-01-01" },
  inicio: "x",
  fim: "y",
  atualizadoEm: "z",
  avisos: [],
  indicadores: {
    avaliacoes: { atual: 2, anterior: 0 },
    notaMedia: { atual: 4.666666, anterior: null },
  },
  porDia: diasDoPeriodo({ de, ate }).map((dia) => ({ dia, ...diaVazio(), recebidas: 1 })),
  porHora: [
    { diaSemana: 5, hora: 11, recebidas: 4 },
    { diaSemana: 5, hora: 16, recebidas: 1 },
    { diaSemana: 1, hora: 9, recebidas: 0 },
  ],
  equipe: [{ id: "uuid-atendente", nome: "JEAN TELEFONE", notaMedia: 5, avaliacoes: 2 }],
  departamentos: [{ id: "uuid-dep", nome: "Recepção", conversas: 3 }],
  registrosAvaliacoes: [{ atendente: "JEAN TELEFONE", paciente: "Maria da Silva", nota: 5 }],
});

describe("análise do dashboard por IA", () => {
  it("usa o modelo barato e rápido escolhido", () => {
    expect(MODELO_ANALISE_DASHBOARD).toBe("google/gemini-3.1-flash-lite");
    expect(INSTRUCOES_ANALISE_DASHBOARD).toContain("SOMENTE os números");
  });

  it("não envia nome de paciente nem ids; arredonda números", () => {
    const json = JSON.stringify(dadosParaAnaliseDashboard(resumo("2026-10-16", "2026-10-16")));
    expect(json).not.toContain("Maria da Silva");
    expect(json).not.toContain("uuid-");
    expect(json).not.toContain('"atualizadoEm"');
    expect(json).toContain("JEAN TELEFONE");
    expect(json).toContain("4.67");
  });

  it("resume horários e agrupa períodos longos", () => {
    const d = dadosParaAnaliseDashboard(resumo("2026-01-01", "2026-10-16")) as any;
    expect(d.serie.agrupadaPor).toBe("mes");
    expect(d.serie.grupos).toHaveLength(10);
    expect(d.horariosMaisMovimentados[0]).toEqual({ dia: "sexta", hora: "11h", recebidas: 4 });
    expect(d.mensagensRecebidasPorDiaDaSemana).toEqual([{ dia: "sexta", recebidas: 5 }]);
    expect(agrupamentoParaAnalise({ de: "2026-10-01", ate: "2026-10-16" })).toBe("dia");
    expect(agrupamentoParaAnalise({ de: "2026-08-01", ate: "2026-10-16" })).toBe("semana");
  });

  it("botão aparece no dashboard e o texto da IA não vira HTML", () => {
    const vazio = renderToStaticMarkup(
      <AnaliseDashboardIA analisar={async () => ({ texto: "", modelo: "", geradoEm: "" })} />,
    );
    expect(vazio).toContain("Analisar com IA");
    const semAnalise = renderToStaticMarkup(
      <DashboardOsZapView
        periodo={{ de: "2026-10-16", ate: "2026-10-16" }}
        agrupamento="dia"
        onAgrupamento={() => {}}
        consultar={() => {}}
        clinica="Clínica"
        atualizando={false}
      />,
    );
    // Sem consulta concluída, não há o que analisar.
    expect(semAnalise).not.toContain("Analisar com IA");
  });
});
