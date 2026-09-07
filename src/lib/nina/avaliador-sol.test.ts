import { describe, expect, it } from "bun:test";
import {
  DIMENSOES,
  calcularScore,
  classificar,
  montarInputSol,
  montarInstrucoesSol,
  parseAvaliacaoSol,
  type Achado,
  type Dossie,
  type NotaDimensao,
} from "./avaliador-sol";

function nota(dimensao: any, valor: number | null, situacao: NotaDimensao["situacao"] = "avaliada"): NotaDimensao {
  return { dimensao, nota: valor, situacao, justificativa: "x" };
}

function achado(p: Partial<Achado>): Achado {
  return {
    mensagem: "m",
    observado: "o",
    esperado: "e",
    fonte: "ferramenta buscar_horarios",
    componente: "agenda",
    confianca: "alta",
    gravidade: "media",
    dimensao: null,
    ...p,
  };
}

describe("score", () => {
  it("é ponderado pelas dimensões avaliadas", () => {
    expect(calcularScore([nota("correcao_informacao", 10), nota("qualidade_resposta", 0)])).toBe(75);
  });

  it("ignora dimensões não verificáveis", () => {
    expect(
      calcularScore([nota("correcao_informacao", 8), nota("uso_rag", null, "nao_verificavel")]),
    ).toBe(80);
  });

  it("sem dimensões avaliadas o score é zero", () => {
    expect(calcularScore([nota("uso_rag", null, "nao_aplicavel")])).toBe(0);
  });
});

describe("classificação", () => {
  it("erro crítico prevalece sobre score alto", () => {
    expect(classificar(98, [achado({ gravidade: "critica" })], 12)).toBe("erro_critico");
  });
  it("achado de gravidade alta reprova", () => {
    expect(classificar(95, [achado({ gravidade: "alta" })], 12)).toBe("reprovado");
  });
  it("score baixo reprova", () => {
    expect(classificar(60, [], 12)).toBe("reprovado");
  });
  it("score bom com observação", () => {
    expect(classificar(88, [achado({ gravidade: "baixa" })], 12)).toBe("aprovado_observacao");
  });
  it("nada a apontar aprova", () => {
    expect(classificar(92, [], 12)).toBe("aprovado");
  });
  it("nenhuma dimensão avaliada nunca aprova", () => {
    expect(classificar(0, [], 0)).toBe("reprovado");
  });
});

describe("leitura da resposta do avaliador", () => {
  it("recalcula score e resultado a partir das notas, ignorando o veredito do modelo", () => {
    const bruto = JSON.stringify({
      resultado: "aprovado",
      score: 100,
      resumo: "Resposta conferida com a agenda.",
      dimensoes: DIMENSOES.map((d) => ({
        dimensao: d.valor,
        situacao: "avaliada",
        nota: d.valor === "correcao_informacao" ? 2 : 9,
        justificativa: "conforme evidência",
      })),
      achados: [
        {
          mensagem: "Dr. X às 14h",
          observado: "Ofereceu 14h",
          esperado: "A agenda devolveu apenas 15h",
          fonte: "ferramenta buscar_horarios",
          componente: "agenda",
          confianca: "alta",
          gravidade: "alta",
          dimensao: "correcao_informacao",
        },
      ],
      lacunas: ["Sem evidência de consulta ao CRM"],
    });
    const r = parseAvaliacaoSol(bruto);
    expect(r.resultado).toBe("reprovado");
    expect(r.score).toBeLessThan(100);
    expect(r.achados).toHaveLength(1);
    expect(r.lacunas[0]).toContain("CRM");
  });

  it("descarta achado genérico sem evidência", () => {
    const r = parseAvaliacaoSol(
      "```json\n" +
        JSON.stringify({
          resumo: "ok",
          dimensoes: [],
          achados: [{ mensagem: "", observado: "A resposta poderia ser melhor.", esperado: "", fonte: "" }],
          lacunas: [],
        }) +
        "\n```",
    );
    expect(r.achados).toHaveLength(0);
  });

  it("dimensão ausente vira não verificável, nunca nota cheia", () => {
    const r = parseAvaliacaoSol(JSON.stringify({ resumo: "", dimensoes: [], achados: [], lacunas: [] }));
    expect(r.dimensoes).toHaveLength(DIMENSOES.length);
    expect(r.dimensoes.every((d) => d.situacao === "nao_verificavel")).toBe(true);
    expect(r.score).toBe(0);
    expect(r.resultado).toBe("reprovado");
  });

  it("rejeita resposta sem JSON", () => {
    expect(() => parseAvaliacaoSol("sem json aqui")).toThrow();
  });
});

describe("dossiê", () => {
  const dossie: Dossie = {
    cenario: "Paciente quer marcar cardiologista",
    objetivo: "Agendar",
    criteriosEsperados: ["Deve usar a ferramenta: buscar_horarios"],
    instrucoes: { versao: 3, publicadoEm: "2026-09-01", origem: "banco" },
    turnos: [{ autor: "paciente", texto: "Quero marcar cardiologista", em: "2026-09-01T10:00:00Z" }],
    ferramentas: [
      {
        ferramenta: "buscar_horarios",
        argumentos: { especialidade: "cardiologia" },
        resposta: { horarios: ["15:00"] },
        ok: true,
        em: "2026-09-01T10:00:01Z",
      },
    ],
    conhecimento: [{ consulta: "Consultas e profissionais", status: "OK", registros: ["Dr. Teste"] }],
    eventos: [{ node: "prompt.compose", tipo: "start", status: "ok", em: "2026-09-01T10:00:00Z" }],
    execucoes: [
      {
        id: "e1",
        modelo: "gpt",
        sucesso: true,
        erro: null,
        handoff: false,
        ferramentas: ["buscar_horarios"],
        conhecimento: "OK",
        promptVersao: 3,
      },
    ],
    resultadoFinal: null,
  };

  it("inclui ground truth e critérios, sem raciocínio interno", () => {
    const [msg] = montarInputSol(dossie);
    expect(msg?.content).toContain("buscar_horarios");
    expect(msg?.content).toContain("15:00");
    expect(msg?.content).toContain("CRITÉRIOS ESPERADOS");
    expect(msg?.content).not.toContain("chain-of-thought");
  });

  it("as instruções proíbem inventar a verdade esperada", () => {
    const i = montarInstrucoesSol();
    expect(i).toContain("Não invente a verdade esperada");
    expect(i).toContain("nao_verificavel");
  });
});
