import { describe, expect, it } from "bun:test";
import { valoresPermitidos, validarResposta } from "@/lib/nina/analista-metricas";
import { calcularCalibracaoPorTipo, type LinhaDecisaoMetrica } from "@/lib/nina/confidence/metricas";

const resultadoConfiabilidade = {
  id: "conf1",
  dados: {
    dias: 30,
    ambiente: "producao",
    respostasAvaliadas: 1200,
    confiancaMedia: 91.4,
    calibracaoPorNivel: [
      { nivel: "HIGH", mensagens: 1000, errosReportados: 7, taxaErro: 0.7 },
      { nivel: "MEDIUM", mensagens: 150, errosReportados: 5, taxaErro: 3.3 },
      { nivel: "LOW", mensagens: 50, errosReportados: 6, taxaErro: 12 },
    ],
    calibracaoPorFaixaScore: {
      faixas: [{ faixa: "95–100%", mensagens: 600, errosReportados: 3, taxaErro: 0.5 }],
      taxaCaiConformeConfiancaSobe: true,
      inversoes: [],
    },
    calibracaoPorTipoDePergunta: [
      { tipo: "valor", mensagens: 300, mensagensAlta: 250, errosReportados: 9, errosAlta: 6, taxaErro: 3, taxaErroAlta: 2.4 },
    ],
    altaConfiancaComErro: { classificacao: "HIGH_CONFIDENCE_ERROR", casos: 7, mensagensAlta: 1000, taxa: 0.7 },
  },
};

function resposta(chave: string, valor: number) {
  return {
    resumo: "r",
    recorte_utilizado: "30 dias",
    indicadores: [{ consulta_id: "conf1", chave, valor, unidade: "percentual" }],
    comparacoes: [],
    o_que_os_dados_mostram: [],
    interpretacao_possivel: [],
    hipoteses_a_investigar: [],
    evidencias: [],
    pontos_de_atencao: [],
    recomendacoes: [],
    limitacoes: [],
    precisa_esclarecimento: false,
    pergunta_ao_usuario: null,
  } as any;
}

describe("FASE 9 — analista e os dados de confiabilidade", () => {
  it("libera os números de calibração para citação, com o nome do campo", () => {
    const permitidos = valoresPermitidos([resultadoConfiabilidade]);
    const indicadores = permitidos.get("conf1")!.indicadores;
    expect(indicadores.get("confiancaMedia")).toContain(91.4);
    expect(indicadores.get("taxaErro")).toEqual(expect.arrayContaining([0.7, 3.3, 12, 0.5, 3]));
    expect(indicadores.get("taxaErroAlta")).toContain(2.4);
    expect(indicadores.get("casos")).toContain(7);
  });

  it("aceita resposta que cita a taxa de erro real e recusa número inventado", () => {
    const permitidos = valoresPermitidos([resultadoConfiabilidade]);
    expect(validarResposta(resposta("taxaErro", 0.7), permitidos).valida).toBe(true);
    expect(validarResposta(resposta("taxaErro", 0.2), permitidos).valida).toBe(false);
  });

  it("calibração por tipo separa erros de alta confiança do total", () => {
    const base = (id: string, score: number, cat: string): LinhaDecisaoMetrica => ({
      id,
      created_at: "2026-09-01T10:00:00.000Z",
      ambiente: "producao",
      conversation_id: null,
      execucao_id: id,
      score,
      nivel: null,
      decisao: "ALLOW",
      acao: null,
      intencao: null,
      categorias: [cat],
      bloqueadores: [],
      reason_codes: [],
      validadores: [],
      ferramentas: [],
      data_local: "2026-09-01",
      dia_semana: 2,
      periodo: "DENTRO_DO_HORARIO",
    });
    const linhas = [base("a", 97, "valor"), base("b", 95, "valor"), base("c", 50, "agenda")];
    const r = calcularCalibracaoPorTipo(linhas, [
      { id: "e1", conversa_id: null, execucao_id: "a", created_at: "2026-09-01T11:00:00.000Z", categoria: null },
    ]);
    expect(r.find((t) => t.tipo === "valor")).toMatchObject({
      mensagens: 2,
      mensagensAlta: 2,
      erros: 1,
      errosAlta: 1,
      taxaErroAlta: 50,
    });
    expect(r.find((t) => t.tipo === "agenda")).toMatchObject({ errosAlta: 0, taxaErroAlta: 0 });
  });
});
