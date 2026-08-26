import { describe, expect, it } from "bun:test";
import { montarRelatorioHtml } from "./print-relatorio-financeiro";

const base = {
  clinicaNome: "Policlínica Menino Jesus",
  titulo: "Lançamentos",
  periodo: "01/08/2026 a 26/08/2026",
  colunas: [{ rotulo: "Data" }, { rotulo: "Descrição" }, { rotulo: "Valor", numerica: true }],
  linhas: [
    ["01/08/2026", "Consulta", "R$ 150,00"],
    ["02/08/2026", "Aluguel", "R$ 900,00"],
  ],
  totais: ["2 registro(s)", "", "R$ 1.050,00"],
};

describe("montarRelatorioHtml", () => {
  it("imprime uma célula por coluna em cada linha", () => {
    const html = montarRelatorioHtml(base);
    expect(html).toContain("<td>Consulta</td>");
    expect(html).toContain('<td class="num">R$ 150,00</td>');
    // Cabeçalho, corpo e rodapé precisam ter o mesmo número de células.
    const celulasDoRodape = html.match(/<tfoot><tr>(.*?)<\/tr><\/tfoot>/)?.[1] ?? "";
    expect(celulasDoRodape.match(/<td/g)?.length).toBe(base.colunas.length);
  });

  it("mostra a linha de totais e a contagem de registros", () => {
    const html = montarRelatorioHtml(base);
    expect(html).toContain("R$ 1.050,00");
    expect(html).toContain("2 registro(s)");
  });

  it("escapa o conteúdo das células para não quebrar o HTML", () => {
    const html = montarRelatorioHtml({
      ...base,
      linhas: [["01/08/2026", "<script>alerta</script>", "R$ 1,00"]],
    });
    expect(html).not.toContain("<script>alerta");
    expect(html).toContain("&lt;script&gt;alerta");
  });

  it("avisa quando o período não tem registros", () => {
    const html = montarRelatorioHtml({
      ...base,
      linhas: [],
      totais: ["0 registro(s)", "", "R$ 0,00"],
    });
    expect(html).toContain("Nenhum registro no período.");
    expect(html).toContain('colspan="3"');
  });

  it("inclui o resumo de receitas e despesas quando informado", () => {
    const html = montarRelatorioHtml({
      ...base,
      resumo: [
        { rotulo: "Receitas", valor: "R$ 150,00" },
        { rotulo: "Despesas", valor: "R$ 900,00" },
        { rotulo: "Saldo do período", valor: "-R$ 750,00" },
      ],
    });
    expect(html).toContain("Saldo do período");
    expect(html).toContain("-R$ 750,00");
  });

  it("usa folha A4 deitada, porque a tabela é larga", () => {
    expect(montarRelatorioHtml(base)).toContain("size: A4 landscape");
  });
});
