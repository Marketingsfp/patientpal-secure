import { describe, expect, it } from "bun:test";
import {
  dataBR,
  descreverFiltros,
  formatarPercentual,
  montarRelatorio,
  rotuloSituacao,
} from "./marcacoes-por-atendente";

describe("montarRelatorio", () => {
  it("soma o total e calcula o percentual de cada linha", () => {
    const r = montarRelatorio([
      { usuario_id: "u1", usuario_nome: "SUELLEN", qtd: 60 },
      { usuario_id: "u2", usuario_nome: "NICOLE", qtd: 40 },
    ]);
    expect(r.total).toBe(100);
    expect(r.linhas[0]).toMatchObject({ nome: "SUELLEN", qtd: 60, percentual: 60 });
    expect(r.linhas[1]).toMatchObject({ nome: "NICOLE", qtd: 40, percentual: 40 });
  });

  it("os percentuais somam 100 quando há registros", () => {
    const r = montarRelatorio([
      { usuario_id: "u1", usuario_nome: "A", qtd: 1 },
      { usuario_id: "u2", usuario_nome: "B", qtd: 1 },
      { usuario_id: "u3", usuario_nome: "C", qtd: 1 },
    ]);
    const soma = r.linhas.reduce((s, l) => s + l.percentual, 0);
    expect(Math.round(soma)).toBe(100);
  });

  it("ordena por quantidade decrescente e desempata pelo nome", () => {
    const r = montarRelatorio([
      { usuario_id: "u1", usuario_nome: "ZENILDA", qtd: 5 },
      { usuario_id: "u2", usuario_nome: "AMANDA", qtd: 5 },
      { usuario_id: "u3", usuario_nome: "NICOLE", qtd: 9 },
    ]);
    expect(r.linhas.map((l) => l.nome)).toEqual(["NICOLE", "AMANDA", "ZENILDA"]);
  });

  it("linha técnica desce para o fim mesmo com quantidade alta", () => {
    const r = montarRelatorio([
      { usuario_id: null, usuario_nome: "sistema", qtd: 500 },
      { usuario_id: "u1", usuario_nome: "SUELLEN", qtd: 10 },
    ]);
    expect(r.linhas.map((l) => l.nome)).toEqual(["SUELLEN", "sistema"]);
    expect(r.linhas[1].ehLinhaTecnica).toBe(true);
    expect(r.linhas[0].ehLinhaTecnica).toBe(false);
  });

  it("linha técnica continua somando no total", () => {
    // Escondê-la faria o total do relatório não bater com a Agenda.
    const r = montarRelatorio([
      { usuario_id: null, usuario_nome: "(marcado antes do registro)", qtd: 30 },
      { usuario_id: "u1", usuario_nome: "SUELLEN", qtd: 70 },
    ]);
    expect(r.total).toBe(100);
  });

  it("marca como técnica também a linha sem autor identificado", () => {
    const r = montarRelatorio([{ usuario_id: null, usuario_nome: "(não identificado)", qtd: 3 }]);
    expect(r.linhas[0].ehLinhaTecnica).toBe(true);
  });

  it("nome vazio vira (não identificado) em vez de linha em branco", () => {
    const r = montarRelatorio([{ usuario_id: null, usuario_nome: "  ", qtd: 2 }]);
    expect(r.linhas[0].nome).toBe("(não identificado)");
    expect(r.linhas[0].ehLinhaTecnica).toBe(true);
  });

  it("lista vazia não divide por zero", () => {
    const r = montarRelatorio([]);
    expect(r.total).toBe(0);
    expect(r.linhas).toEqual([]);
  });

  it("total zero não gera percentual NaN", () => {
    const r = montarRelatorio([{ usuario_id: "u1", usuario_nome: "A", qtd: 0 }]);
    expect(r.linhas[0].percentual).toBe(0);
  });
});

describe("formatação", () => {
  it("percentual sai com uma casa e vírgula", () => {
    expect(formatarPercentual(16.75)).toBe("16,8%");
    expect(formatarPercentual(0)).toBe("0,0%");
  });

  it("data sai em DD/MM/AAAA", () => {
    expect(dataBR("2026-09-09")).toBe("09/09/2026");
    expect(dataBR("")).toBe("");
    expect(dataBR(null)).toBe("");
  });

  it("rótulo da situação usa o texto do balcão", () => {
    expect(rotuloSituacao("realizado")).toBe("Atendidos");
    expect(rotuloSituacao("todos")).toBe("Todas");
    expect(rotuloSituacao("inexistente")).toBe("Todas");
  });
});

describe("descreverFiltros", () => {
  it("descreve período, situação e recortes", () => {
    const linhas = descreverFiltros({
      atendIni: "2026-09-01",
      atendFim: "2026-09-09",
      marcIni: "",
      marcFim: "",
      situacaoRotulo: "Atendidos",
      medicoNome: "MARINA ALMEIDA DIAS",
      especialidadeNome: null,
    });
    expect(linhas[0]).toBe("Atendimento: 01/09/2026 a 09/09/2026");
    expect(linhas).toContain("Situação: Atendidos");
    expect(linhas).toContain("Profissional: MARINA ALMEIDA DIAS");
    expect(linhas).toContain("Especialidade: Todas");
  });

  it("só cita o período de marcação quando ele foi preenchido", () => {
    const sem = descreverFiltros({
      atendIni: "2026-09-01",
      atendFim: "2026-09-09",
      marcIni: "",
      marcFim: "",
      situacaoRotulo: "Todas",
    });
    expect(sem.some((l) => l.startsWith("Marcação:"))).toBe(false);

    const com = descreverFiltros({
      atendIni: "",
      atendFim: "",
      marcIni: "2026-09-01",
      marcFim: "2026-09-09",
      situacaoRotulo: "Todas",
    });
    expect(com).toContain("Marcação: 01/09/2026 a 09/09/2026");
    expect(com[0]).toBe("Atendimento: todo o período");
  });
});
