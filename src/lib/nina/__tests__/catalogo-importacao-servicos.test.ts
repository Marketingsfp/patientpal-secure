import { describe, expect, test } from "bun:test";
import { dadosDoServico } from "../catalogo-importacao-servicos";
import { servicoSchema } from "../catalogo";

describe("exames e procedimentos: adaptação dos fatos cadastrados", () => {
  test("não inventa valores, preparo, executante ou condições ausentes", () => {
    const d = dadosDoServico({ nome: "Exame", valor_padrao: 0, valor_pix: 0 });
    expect(d).toMatchObject({
      valor: null,
      valor_observacao: null,
      preparo: null,
      restricoes: null,
      descricao_publica: null,
      formas_pagamento: [],
    });
    expect(servicoSchema.parse(d).executantes).toEqual([]);
  });
  test("preserva preços distintos e a condição de cada convênio", () => {
    const d = dadosDoServico(
      {
        valor_dinheiro: 100,
        valor_dinheiro_pix: 90,
        valor_pix: 110,
        valor_cartao_credito: 130,
        valor_cartao_debito: 120,
      },
      [{ nome: "Convênio A", valor_dinheiro: 80, valor_outros: 95 }],
    );
    expect(d.formas_pagamento).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ forma: "Dinheiro", valor: 100, condicao: null }),
        expect.objectContaining({ forma: "Pix", valor: 110, condicao: null }),
        expect.objectContaining({ forma: "Cartão de crédito", valor: 130, condicao: null }),
        expect.objectContaining({ forma: "Cartão de débito", valor: 120, condicao: null }),
        expect.objectContaining({ forma: "Dinheiro", valor: 80, condicao: "Convênio A" }),
        expect.objectContaining({
          forma: "Pix / Débito / Crédito",
          valor: 95,
          condicao: "Convênio A",
        }),
      ]),
    );
  });
  test("campo legado de dinheiro não comprova preço do Pix; cartão genérico não inventa modalidade", () => {
    const d = dadosDoServico({ valor_dinheiro_pix: 100, valor_cartao: 120 });
    expect(d.formas_pagamento.map((x) => x.forma).sort()).toEqual(["Cartão", "Dinheiro"]);
  });
  test("preço variável não oferece valor fixo; referência não vira forma de pagamento", () => {
    expect(
      dadosDoServico({ valor_variavel: true, valor_padrao: 100, valor_pix: 120 }),
    ).toMatchObject({ valor: null, formas_pagamento: [], valor_observacao: "Valor sob consulta." });
    expect(dadosDoServico({ valor_padrao: 100 })).toMatchObject({
      valor: 100,
      formas_pagamento: [],
      valor_observacao: "Valor de referência cadastrado; forma de pagamento não informada.",
    });
  });
  test("preserva protocolo completo na descrição usando apenas seu cabeçalho no título", () => {
    const nome = "Protocolo: " + "Descrição cadastrada. ".repeat(15);
    const d = dadosDoServico({
      nome,
      observacoes: "Observação",
      sessoes_incluidas: 5,
      ciclo_dias: 7,
      exige_autorizacao: true,
    });
    expect(d.nome).toBe("Protocolo");
    expect(d.descricao_publica).toContain(nome.trim());
    expect(d.descricao_publica).toContain("Sessões incluídas: 5.");
    expect(d.restricoes).toBe("Exige autorização.");
    expect(servicoSchema.safeParse(d).success).toBe(true);
  });
  test("ausência de instruções não dispensa preparo, pedido médico ou laudo", () => {
    const d = dadosDoServico({ nome: "Exame", exige_preparo: true, requer_laudo: true });
    expect(d.preparo).toBeNull();
    expect(d.restricoes).toContain("orientações não informadas");
    expect(d.descricao_publica).toBe("Laudo previsto no cadastro.");
    expect(d).not.toHaveProperty("pedido_medico");
  });
});
