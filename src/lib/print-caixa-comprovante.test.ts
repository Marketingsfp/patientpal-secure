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
