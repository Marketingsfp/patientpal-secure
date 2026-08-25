import { describe, expect, it } from "bun:test";
import { buildComprovanteCaixaHtml } from "./print-caixa-comprovante";

const base = {
  tipo: "fechamento" as const,
  clinicaNome: "POLICLINICA MENINO JESUS",
  operadorNome: "EDNALDA PAULINA DE OLIVEIRA",
  valor: 3592.97,
  saldoCalculado: 3592.97,
  valorInformado: 3592.97,
  diferenca: 0,
  retroativos: { total: 182, quantidade: 2, dias: ["14/08/2026", "19/08/2026"] },
};

describe("cupom de fechamento com retroativos", () => {
  for (const formato of ["a4", "80mm"] as const) {
    it(`mostra a linha de retroativos no ${formato}`, () => {
      const html = buildComprovanteCaixaHtml({ ...base, formato });
      expect(html).toContain("atendimento de outro dia");
      expect(html).toContain("2 guias");
      expect(html).toContain("14/08/2026, 19/08/2026");
      expect(html).toContain("incluído no total acima");
      expect(html).toContain("3.592,97");
    });
    it(`omite a linha quando nao ha retroativo no ${formato}`, () => {
      const html = buildComprovanteCaixaHtml({ ...base, formato, retroativos: undefined });
      expect(html).not.toContain("atendimento de outro dia");
      expect(html).toContain("3.592,97");
    });
  }
});

// Guia de dia anterior JA PAGA, emitida hoje (movimento de tipo 'registro').
// Aparece no cupom como historico, mas nao esta somada no total.
describe("cupom de fechamento com guias antigas já pagas", () => {
  const comRegistros = {
    ...base,
    retroativos: undefined,
    registros: { total: 931.99, quantidade: 2 },
  };

  for (const formato of ["a4", "80mm"] as const) {
    it(`mostra a linha de registro no ${formato}, separada do total`, () => {
      const html = buildComprovanteCaixaHtml({ ...comRegistros, formato });
      expect(html).toContain("Guias de dias anteriores já pagas");
      expect(html).toContain("2 guias");
      expect(html).toContain("931,99");
      expect(html).toContain("NÃO somado no total acima");
      // O total conferido continua intocado.
      expect(html).toContain("3.592,97");
    });

    it(`omite a linha quando não houve guia antiga no ${formato}`, () => {
      const html = buildComprovanteCaixaHtml({ ...comRegistros, formato, registros: undefined });
      expect(html).not.toContain("Guias de dias anteriores já pagas");
    });
  }

  it("as duas linhas convivem: retroativo que entrou e registro que não entrou", () => {
    const html = buildComprovanteCaixaHtml({
      ...base,
      retroativos: { total: 182, quantidade: 2, dias: ["14/08/2026", "19/08/2026"] },
      registros: { total: 931.99, quantidade: 2 },
    });
    expect(html).toContain("atendimento de outro dia"); // entrou na gaveta
    expect(html).toContain("Guias de dias anteriores já pagas"); // não entrou
    expect(html).toContain("Já incluído no total acima");
    expect(html).toContain("NÃO somado no total acima");
  });
});
