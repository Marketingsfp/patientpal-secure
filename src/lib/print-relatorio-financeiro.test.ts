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

describe("composição por forma de pagamento", () => {
  const comComposicao = {
    ...base,
    resumo: [{ rotulo: "Saldo do período", valor: "R$ 1.050,00" }],
    composicao: {
      titulo: "Composição da receita bruta",
      itens: [
        { rotulo: "Dinheiro", valor: "R$ 600,00" },
        { rotulo: "PIX", valor: "R$ 450,00" },
        { rotulo: "Cartão de Crédito", valor: "R$ 0,00" },
      ],
    },
  };

  it("imprime o título e uma linha por forma", () => {
    const html = montarRelatorioHtml(comComposicao);
    expect(html).toContain("Composição da receita bruta");
    expect(html).toContain("Cartão de Crédito");
    expect(html).toContain("R$ 450,00");
  });

  it("fica num bloco próprio, sem se misturar ao resumo", () => {
    const html = montarRelatorioHtml(comComposicao);
    const bloco = html.match(/<div class="composicao">(.*?)<\/div><div class="resumo">/s)?.[1];
    expect(bloco).toBeTruthy();
    expect(bloco).not.toContain("Saldo do período");
  });

  it("sem composição a folha continua saindo com o resumo sozinho", () => {
    const html = montarRelatorioHtml({ ...base, resumo: comComposicao.resumo });
    expect(html).toContain('<div class="resumo">');
    expect(html).not.toContain('class="composicao"');
  });
});

describe("compactação e assinatura da folha", () => {
  it("mantém resumo, composição e assinatura inteiros na quebra de página", () => {
    const html = montarRelatorioHtml(base);
    expect(html).toContain(".blocos, .assinaturas { break-inside: avoid;");
    expect(html).toContain("tfoot { display: table-row-group; break-inside: avoid;");
  });

  it("imprime uma linha por assinatura pedida", () => {
    const html = montarRelatorioHtml({
      ...base,
      assinaturas: [{ cargo: "Médico / Profissional" }, { cargo: "Responsável Financeiro" }],
    });
    expect(html.match(/class="assinatura"/g)?.length).toBe(2);
    expect(html).toContain("Médico / Profissional");
    expect(html).toContain("Assinatura e carimbo");
  });

  it("sem assinatura pedida a folha não sai com linha em branco no pé", () => {
    expect(montarRelatorioHtml(base)).not.toContain('class="assinaturas"');
  });
});
