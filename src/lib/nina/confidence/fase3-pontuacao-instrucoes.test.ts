/**
 * FASE 3 (PONTUAÇÃO) — repartição do peso das instruções no caminho ativo.
 *
 * O que estes testes protegem:
 *  1. o orçamento configurado é dividido entre as obrigações substantivas, e o
 *     agregado nunca é somado junto com as próprias parcelas;
 *  2. obrigações equivalentes contam uma vez só;
 *  3. UNKNOWN relevante reduz cobertura sem receber nota de aprovação;
 *  4. NOT_APPLICABLE e PENDING ficam fora da nota e da cobertura;
 *  5. linguagem sem verificador fica em dimensão separada e, sozinha, não
 *     rebaixa o turno — mas continua declarada;
 *  6. requisito essencial violado ou sem prova continua impedindo aprovação;
 *  7. ausência de evidência avaliável nunca vira 100.
 */
import { describe, expect, it } from "bun:test";
import {
  DIMENSAO_INSTRUCOES,
  DIMENSAO_LINGUAGEM,
  categoriaDaObrigacao,
  explicarInstrucoes,
  repartirInstrucoes,
} from "./pontuacao-instrucoes";
import { POLITICA_PADRAO, aplicarPolitica, medirEvidencia } from "./policy";
import type { ResultadoValidador } from "./types";

type Obrigacao = Record<string, unknown>;

function agregado(obrigacoes: Obrigacao[], limitacoes: string[] = []): ResultadoValidador {
  return {
    validator: DIMENSAO_INSTRUCOES,
    status: "PASS",
    score: 100,
    reasonCode: "TESTE",
    evidence: { obrigacoes, limitacoes },
    blocker: null,
  };
}

const obrig = (over: Obrigacao = {}): Obrigacao => ({
  id: "o1",
  tipo: "conduta",
  origem: "instrucoes_publicadas",
  descricao: "descrição da obrigação",
  status: "cumprida",
  motivo: "CONFERIDA",
  prioridade: "alta",
  natureza: "obrigacao",
  verificacao: "deterministica",
  regraId: "ID-01",
  ...over,
});

describe("FASE 3 — categorias das obrigações", () => {
  it("o que o paciente pediu é conversacional, não regra interna", () => {
    expect(categoriaDaObrigacao(obrig({ origem: "mensagem_paciente" }) as never)).toBe(
      "CONVERSACIONAL",
    );
  });

  it("exigência conferível e prioritária da publicação é essencial", () => {
    expect(
      categoriaDaObrigacao(obrig({ prioridade: "critica", verificacao: "deterministica" }) as never),
    ).toBe("ESSENCIAL");
  });

  it("exigência de forma em texto aberto vai para a dimensão de linguagem", () => {
    expect(
      categoriaDaObrigacao(
        obrig({
          prioridade: "alta",
          verificacao: "semantica",
          motivo: "LINGUAGEM_ABERTA_NAO_VERIFICAVEL",
        }) as never,
      ),
    ).toBe("LINGUAGEM");
  });

  it("regra publicada não compreendida continua substantiva", () => {
    expect(
      categoriaDaObrigacao(
        obrig({ tipo: "restricao_nao_interpretada", prioridade: "critica", verificacao: "semantica" }) as never,
      ),
    ).toBe("ESSENCIAL");
  });
});

describe("FASE 3 — repartição do orçamento", () => {
  it("divide o peso configurado entre as obrigações substantivas", () => {
    const r = repartirInstrucoes(
      agregado([
        obrig({ id: "a", regraId: "ID-01" }),
        obrig({ id: "b", regraId: "ID-02" }),
        obrig({ id: "c", regraId: "ID-03" }),
      ]),
    );
    expect(r).not.toBeNull();
    expect(r!.parcelas).toHaveLength(3);
    const soma = r!.parcelas.reduce((t, p) => t + (p.pesoParcela ?? 0), 0);
    expect(Math.round(soma)).toBe(POLITICA_PADRAO.pesos[DIMENSAO_INSTRUCOES]);
  });

  it("não soma o peso do agregado junto com o das parcelas", () => {
    const r = repartirInstrucoes(
      agregado([obrig({ id: "a", regraId: "ID-01" }), obrig({ id: "b", regraId: "ID-02" })]),
    )!;
    // O agregado sai da lista medida; entram só as parcelas.
    const medida = medirEvidencia(r.parcelas, POLITICA_PADRAO);
    expect(medida.pesoRelevante).toBe(POLITICA_PADRAO.pesos[DIMENSAO_INSTRUCOES]);
  });

  it("agrupa obrigações equivalentes em uma parcela só", () => {
    const r = repartirInstrucoes(
      agregado([
        obrig({ id: "a", regraId: "ID-01" }),
        obrig({ id: "b", regraId: "ID-01" }),
        obrig({ id: "c", regraId: "ID-02" }),
      ]),
    )!;
    expect(r.parcelas).toHaveLength(2);
  });

  it("no grupo, o pior estado prevalece: duplicar não apaga a falha", () => {
    const r = repartirInstrucoes(
      agregado([
        obrig({ id: "a", regraId: "ID-01", status: "cumprida" }),
        obrig({ id: "b", regraId: "ID-01", status: "descumprida", motivo: "VIOLADA" }),
      ]),
    )!;
    expect(r.parcelas).toHaveLength(1);
    expect(r.parcelas[0]!.status).toBe("FAIL");
  });
});

describe("FASE 3 — nota e cobertura separadas", () => {
  it("UNKNOWN relevante reduz a cobertura e não recebe nota de aprovação", () => {
    const r = repartirInstrucoes(
      agregado([
        obrig({ id: "a", regraId: "ID-01", status: "cumprida" }),
        obrig({
          id: "b",
          regraId: "ID-02",
          status: "indeterminada",
          motivo: "CONDICAO_NAO_COMPREENDIDA",
        }),
      ]),
    )!;
    const m = medirEvidencia(r.parcelas, POLITICA_PADRAO);
    expect(m.cobertura).toBe(50);
    expect(m.score).toBe(100); // média só do que é conhecido
    expect(r.memoria.parcelas.find((p) => p.status === "UNKNOWN")!.nota).toBeNull();
  });

  it("NOT_APPLICABLE e PENDING ficam fora da nota e da cobertura", () => {
    const r = repartirInstrucoes(
      agregado([
        obrig({ id: "a", regraId: "ID-01", status: "cumprida" }),
        obrig({ id: "b", regraId: "ID-02", status: "nao_aplicavel" }),
      ]),
    )!;
    expect(r.parcelas).toHaveLength(1);
    const m = medirEvidencia(r.parcelas, POLITICA_PADRAO);
    expect(m.cobertura).toBe(100);
    expect(m.naoAplicaveis.length + m.pendentes.length).toBe(0);
  });

  it("nenhuma evidência avaliável não resulta em 100", () => {
    const r = repartirInstrucoes(
      agregado([
        obrig({ id: "a", regraId: "ID-01", status: "indeterminada", motivo: "SEM_EVIDENCIA" }),
      ]),
    )!;
    const m = medirEvidencia(r.parcelas, POLITICA_PADRAO);
    expect(m.semEvidencia).toBe(true);
    expect(m.score).toBe(0);
  });
});

describe("FASE 3 — linguagem em dimensão separada", () => {
  const linguagem = obrig({
    id: "L",
    regraId: "CONV-01",
    prioridade: "alta",
    verificacao: "semantica",
    status: "indeterminada",
    motivo: "LINGUAGEM_ABERTA_NAO_VERIFICAVEL",
  });

  it("não entra na nota nem na cobertura e não rebaixa sozinha", () => {
    const r = repartirInstrucoes(agregado([linguagem]))!;
    expect(r.parcelas).toHaveLength(0);
    expect(r.linguagem?.validator).toBe(DIMENSAO_LINGUAGEM);
    expect(r.linguagem?.pesoParcela).toBe(0);

    const m = medirEvidencia([...r.parcelas, r.linguagem!], POLITICA_PADRAO);
    expect(m.pesoRelevante).toBe(0);
  });

  it("continua declarada como indeterminada, nunca aprovada em silêncio", () => {
    const r = repartirInstrucoes(agregado([linguagem]))!;
    expect(r.linguagem?.status).toBe("UNKNOWN");
    expect(r.memoria.linguagem.indeterminadas).toBe(1);
    expect(r.memoria.linguagem.nota).toBeNull();
  });

  it("linguagem não é tratada como requisito essencial em falta", () => {
    const r = repartirInstrucoes(agregado([linguagem]))!;
    expect(r.memoria.essencial.violado).toBe(false);
    expect(r.memoria.essencial.semProva).toBe(false);
  });
});

describe("FASE 3 — requisito essencial", () => {
  const essencial = (status: string) =>
    obrig({
      id: "E",
      regraId: "ID-CRIT",
      prioridade: "critica",
      verificacao: "deterministica",
      status,
      motivo: "REGRA_CRITICA",
    });

  it("violação de requisito essencial impede aprovação", () => {
    const r = repartirInstrucoes(agregado([essencial("descumprida")]))!;
    expect(r.memoria.essencial.violado).toBe(true);

    const p = aplicarPolitica(
      {
        scoreValidadores: 100,
        penalidade: 0,
        bloqueadores: [],
        hardBlockers: [],
        risco: "BAIXO",
        acao: "nenhuma",
        esclarecimentoUsado: false,
        ambiguidadeResolvivel: false,
        cobertura: 100,
        semEvidencia: false,
        dimensoesDesconhecidas: [],
        requisitoEssencialViolado: true,
      },
      POLITICA_PADRAO,
    );
    expect(p.decision).not.toBe("ALLOW");
    expect(p.limitacoes).toContain("ESSENTIAL_REQUIREMENT_VIOLATED");
  });

  it("requisito essencial sem prova também impede aprovação", () => {
    const r = repartirInstrucoes(agregado([essencial("indeterminada")]))!;
    expect(r.memoria.essencial.semProva).toBe(true);

    const p = aplicarPolitica(
      {
        scoreValidadores: 100,
        penalidade: 0,
        bloqueadores: [],
        hardBlockers: [],
        risco: "BAIXO",
        acao: "nenhuma",
        esclarecimentoUsado: false,
        ambiguidadeResolvivel: false,
        cobertura: 100,
        semEvidencia: false,
        dimensoesDesconhecidas: [],
        requisitoEssencialSemProva: true,
      },
      POLITICA_PADRAO,
    );
    expect(p.decision).not.toBe("ALLOW");
    expect(p.limitacoes).toContain("ESSENTIAL_REQUIREMENT_UNPROVEN");
  });
});

describe("FASE 3 — memória de cálculo auditável", () => {
  it("sem obrigação conferível, o agregado continua valendo como antes", () => {
    expect(repartirInstrucoes(agregado([]))).toBeNull();
  });

  it("explica orçamento, parcelas, linguagem e requisito essencial", () => {
    const r = repartirInstrucoes(
      agregado([obrig({ id: "a", regraId: "ID-01" }), obrig({ id: "b", regraId: "ID-02" })]),
    )!;
    const texto = explicarInstrucoes(r.memoria);
    expect(texto).toContain("orcamento=15");
    expect(texto).toContain("ID-01");
    expect(texto).toContain("linguagem=");
    expect(texto).toContain("essencial:");
    expect(texto).toContain(r.memoria.versao);
  });
});
