import { describe, expect, it } from "bun:test";
import { projetarMes, type DiaCaixa } from "./projecao";
import { montarContextoPergunta, type EntradaPergunta } from "./projecao-pergunta";

const historico = [
  { dia: "2026-09-14", receita: 10000, pagamentos: 100 },
  { dia: "2026-09-15", receita: 10000, pagamentos: 100 },
  { dia: "2026-09-16", receita: 10000, pagamentos: 100 },
  { dia: "2026-09-17", receita: 10000, pagamentos: 100 },
  { dia: "2026-09-18", receita: 10000, pagamentos: 100 },
  { dia: "2026-09-19", receita: 4000, pagamentos: 50 },
];

const dias: DiaCaixa[] = [
  { data: "2026-09-24", receita: 100000, despesa: 0, atendimentos: 1000 },
  { data: "2026-09-28", receita: 2000, despesa: 0, atendimentos: 20 },
];

// Hoje = segunda 28/09; faltam seg 28, ter 29, qua 30.
const r = projetarMes({
  inicio: "2026-09-01",
  fim: "2026-09-30",
  hoje: "2026-09-28",
  dias,
  historico,
});

const base: Omit<EntradaPergunta, "pergunta"> = {
  r,
  historico,
  hoje: "2026-09-28",
  fimMes: "2026-09-30",
  mesAnterior: { nome: "agosto de 2026", receita: 120000 },
  metaTela: 0,
  simulacoes: [],
};

describe("montarContextoPergunta", () => {
  it("valor na pergunta vira a tabela calculada pelo sistema", () => {
    const c = montarContextoPergunta({ ...base, pergunta: "quanto preciso para fechar 136 mil?" });
    expect(c.alvo?.valor).toBe(136000);
    expect(c.alvo?.origem).toBe("pergunta");
    // Falta 36.000 contra 30.000 no ritmo: +20% em cada dia.
    expect(c.tabela?.esforcoPercentual).toBe(20);
    expect(c.tabela?.linhas[0].atendimentosNecessarios).toBe(120);
    expect(c.contexto).toContain("Segunda: precisa 120 atendimentos");
  });

  it("sem valor na pergunta, usa a meta da tela", () => {
    const c = montarContextoPergunta({
      ...base,
      metaTela: 130000,
      pergunta: "qual dia rende mais?",
    });
    expect(c.alvo?.origem).toBe("meta da tela");
    expect(c.tabela?.esforcoPercentual).toBe(0);
  });

  it("sem valor e sem meta, avisa que não há cálculo pronto", () => {
    const c = montarContextoPergunta({ ...base, pergunta: "qual dia rende mais?" });
    expect(c.alvo).toBeNull();
    expect(c.tabela).toBeNull();
    expect(c.contexto).toContain("CÁLCULO PRONTO PARA O ALVO: nenhum");
  });

  it("separa o que entrou até ontem do parcial de hoje", () => {
    const c = montarContextoPergunta({ ...base, pergunta: "como estamos?" });
    const texto = c.contexto.replace(/\s/g, " ");
    expect(texto).toContain("Receita até ontem: R$ 100.000,00");
    expect(texto).toContain("dia em andamento): R$ 2.000,00");
  });

  it("percentual na pergunta usa o mês anterior", () => {
    const c = montarContextoPergunta({ ...base, pergunta: "e para crescer 10%?" });
    expect(c.alvo?.valor).toBe(132000);
  });
});

describe("continuação da conversa", () => {
  it('"e no sábado?" segue o alvo da pergunta anterior, não a meta da tela', () => {
    const c = montarContextoPergunta({
      ...base,
      metaTela: 130000,
      pergunta: "e na terça?",
      alvoAnterior: { valor: 136000, explicacao: "Meta de R$ 136.000,00 no mês." },
    });
    expect(c.alvo?.origem).toBe("pergunta anterior");
    expect(c.tabela?.esforcoPercentual).toBe(20);
  });

  it("valor novo na pergunta vence o alvo anterior", () => {
    const c = montarContextoPergunta({
      ...base,
      pergunta: "e se fosse 130 mil?",
      alvoAnterior: { valor: 136000, explicacao: "Meta de R$ 136.000,00 no mês." },
    });
    expect(c.alvo?.valor).toBe(130000);
  });
});
