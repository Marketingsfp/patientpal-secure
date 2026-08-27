import { describe, expect, it } from "bun:test";
import { mesBR, situacaoMensalista, totaisPorSituacao } from "./mensalistas";

const AGOSTO = { de: "2026-08-01", ate: "2026-08-31" };

describe("situacaoMensalista", () => {
  it("competência dentro do período é 'do período'", () => {
    expect(situacaoMensalista("2026-08-01", AGOSTO)).toBe("periodo");
  });

  it("competência de mês anterior é atrasado", () => {
    expect(situacaoMensalista("2026-07-01", AGOSTO)).toBe("atrasado");
  });

  it("competência de mês seguinte é antecipado", () => {
    expect(situacaoMensalista("2026-09-01", AGOSTO)).toBe("antecipado");
  });

  it("compara por MÊS, não por dia", () => {
    // Recorte de 15 a 20/08: a mensalidade de agosto continua sendo do
    // período. Comparando dia a dia ela cairia em "atrasado".
    const recorte = { de: "2026-08-15", ate: "2026-08-20" };
    expect(situacaoMensalista("2026-08-01", recorte)).toBe("periodo");
  });

  it("período que atravessa meses aceita todos os meses de dentro", () => {
    const trimestre = { de: "2026-07-01", ate: "2026-09-30" };
    expect(situacaoMensalista("2026-07-01", trimestre)).toBe("periodo");
    expect(situacaoMensalista("2026-08-01", trimestre)).toBe("periodo");
    expect(situacaoMensalista("2026-09-01", trimestre)).toBe("periodo");
    expect(situacaoMensalista("2026-06-01", trimestre)).toBe("atrasado");
    expect(situacaoMensalista("2026-10-01", trimestre)).toBe("antecipado");
  });

  it("sem competência não classifica", () => {
    expect(situacaoMensalista(null, AGOSTO)).toBeNull();
    expect(situacaoMensalista("", AGOSTO)).toBeNull();
  });
});

describe("totaisPorSituacao", () => {
  it("soma cada situação e o total geral", () => {
    const r = totaisPorSituacao(
      [
        { tipo: "mensalista", valor: 150, competencia: "2026-08-01" },
        { tipo: "mensalista", valor: "150.50", competencia: "2026-08-01" },
        { tipo: "mensalista", valor: 150, competencia: "2026-07-01" },
        { tipo: "mensalista", valor: 150, competencia: "2026-09-01" },
      ],
      AGOSTO,
    );
    expect(r.porSituacao.periodo).toEqual({ qtd: 2, total: 300.5 });
    expect(r.porSituacao.atrasado).toEqual({ qtd: 1, total: 150 });
    expect(r.porSituacao.antecipado).toEqual({ qtd: 1, total: 150 });
    expect(r.total).toEqual({ qtd: 4, total: 600.5 });
  });

  it("rotativo não entra no painel de mensalistas", () => {
    const r = totaisPorSituacao(
      [
        { tipo: "rotativo", valor: 10 },
        { tipo: "mensalista", valor: 150, competencia: "2026-08-01" },
      ],
      AGOSTO,
    );
    expect(r.total).toEqual({ qtd: 1, total: 150 });
  });

  it("mensalista sem competência não é contado nem some do total dele", () => {
    // O banco impede esse caso por constraint; a tela não pode quebrar se
    // algum registro antigo escapar.
    const r = totaisPorSituacao([{ tipo: "mensalista", valor: 150 }], AGOSTO);
    expect(r.total).toEqual({ qtd: 0, total: 0 });
  });

  it("lista vazia devolve zeros nas três situações", () => {
    const r = totaisPorSituacao([], AGOSTO);
    expect(r.porSituacao.periodo).toEqual({ qtd: 0, total: 0 });
    expect(r.porSituacao.atrasado).toEqual({ qtd: 0, total: 0 });
    expect(r.porSituacao.antecipado).toEqual({ qtd: 0, total: 0 });
    expect(r.total).toEqual({ qtd: 0, total: 0 });
  });

  it("a soma das três situações fecha com o total", () => {
    const r = totaisPorSituacao(
      [
        { tipo: "mensalista", valor: 10.1, competencia: "2026-08-01" },
        { tipo: "mensalista", valor: 20.2, competencia: "2026-07-01" },
        { tipo: "mensalista", valor: 30.3, competencia: "2026-09-01" },
      ],
      AGOSTO,
    );
    const soma =
      r.porSituacao.periodo.total + r.porSituacao.atrasado.total + r.porSituacao.antecipado.total;
    expect(Number(soma.toFixed(2))).toBe(r.total.total);
  });
});

describe("mesBR", () => {
  it("formata a competência para leitura", () => {
    expect(mesBR("2026-08-01")).toBe("08/2026");
    expect(mesBR(null)).toBe("");
  });
});
