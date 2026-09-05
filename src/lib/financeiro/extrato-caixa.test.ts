import { describe, expect, it } from "bun:test";
import {
  CATEGORIA_TRANSFERENCIA,
  SEM_CATEGORIA,
  bancoContaDaLinha,
  categoriaDaLinha,
  colunasExtrato,
  ehSaida,
  favorecidoDaLinha,
  linhasAnaliticas,
  linhasExtrato,
  linhasSinteticas,
  fatiasDeEntrada,
  obsDaLinha,
  ordenarCronologico,
  resumoPorForma,
  totaisExtrato,
  type MovimentacaoExtrato,
} from "./extrato-caixa";

/** Movimentação mínima; cada teste sobrescreve só o que lhe interessa. */
const mov = (over: Partial<MovimentacaoExtrato> = {}): MovimentacaoExtrato => ({
  data: "2026-09-02",
  tipo: "receita",
  descricao: "LANCAMENTO",
  valor: 100,
  ...over,
});

describe("ehSaida", () => {
  it("despesa sai", () => {
    expect(ehSaida(mov({ tipo: "despesa" }))).toBe(true);
  });
  it("receita entra", () => {
    expect(ehSaida(mov({ tipo: "receita" }))).toBe(false);
  });
  it("sangria sai e suprimento entra", () => {
    expect(ehSaida(mov({ tipo: "transferencia", transferSentido: "saida" }))).toBe(true);
    expect(ehSaida(mov({ tipo: "transferencia", transferSentido: "entrada" }))).toBe(false);
  });
});

describe("favorecidoDaLinha", () => {
  it("paciente vinculado vence a descrição", () => {
    expect(
      favorecidoDaLinha(
        mov({ pacienteNome: "LETICIA LEONARDO BEZERRA", descricao: "MENSALIDADE 2/12" }),
      ),
    ).toBe("LETICIA LEONARDO BEZERRA");
  });

  it("repasse sem categoria usa o médico vinculado, não a descrição automática", () => {
    expect(
      favorecidoDaLinha(
        mov({
          tipo: "despesa",
          medicoNome: "ISIS SERRANO DUARTE",
          descricao: "REPASSE MEDICO — ISIS SERRANO DUARTE (37 ATEND.)",
        }),
      ),
    ).toBe("ISIS SERRANO DUARTE");
  });

  it("receita de atendimento corta o procedimento colado no nome", () => {
    expect(
      favorecidoDaLinha(mov({ descricao: "CELIA MELO DA SILVA — CONSULTA (CARDIOLOGIA)" })),
    ).toBe("CELIA MELO DA SILVA");
  });

  it("despesa digitada à mão fica com a descrição inteira", () => {
    expect(favorecidoDaLinha(mov({ tipo: "despesa", descricao: "PAO P/SEMANA" }))).toBe(
      "PAO P/SEMANA",
    );
  });

  it("descrição vazia não devolve célula vazia na coluna", () => {
    expect(favorecidoDaLinha(mov({ descricao: "" }))).toBe("(sem favorecido)");
  });
});

describe("categoriaDaLinha", () => {
  it("usa a categoria cadastrada, em maiúsculas", () => {
    expect(categoriaDaLinha(mov({ categoriaNome: "Boletos" }))).toBe("BOLETOS");
  });

  it("deduz REPASSE MEDICO quando o lançamento veio sem categoria", () => {
    expect(
      categoriaDaLinha(
        mov({ tipo: "despesa", descricao: "REPASSE MEDICO — DAIANE HELENA (4 ATEND.)" }),
      ),
    ).toBe("REPASSE MEDICO");
  });

  it("separa o repasse do terceiro do repasse do médico", () => {
    expect(
      categoriaDaLinha(
        mov({ tipo: "despesa", descricao: "REPASSE TERCEIRO — JOAO HELIO VALENTIM (13 ATEND.)" }),
      ),
    ).toBe("REPASSE TERCEIRO");
  });

  it("sangria e suprimento têm categoria própria", () => {
    expect(
      categoriaDaLinha(mov({ tipo: "transferencia", descricao: "Sangria — Entregue a: X" })),
    ).toBe(CATEGORIA_TRANSFERENCIA);
  });

  it("o que não dá para deduzir fica marcado como pendência", () => {
    expect(categoriaDaLinha(mov({ tipo: "despesa", descricao: "PAO P/SEMANA" }))).toBe(
      SEM_CATEGORIA,
    );
  });
});

describe("bancoContaDaLinha", () => {
  it("junta conta e banco", () => {
    expect(bancoContaDaLinha(mov({ contaNome: "CONTA MOVIMENTO", contaBanco: "BRADESCO" }))).toBe(
      "CONTA MOVIMENTO (BRADESCO)",
    );
  });
  it("não repete o banco quando ele é o próprio nome da conta", () => {
    expect(bancoContaDaLinha(mov({ contaNome: "CAIXA", contaBanco: "caixa" }))).toBe("CAIXA");
  });
  it("aceita conta sem banco cadastrado", () => {
    expect(bancoContaDaLinha(mov({ contaNome: "CAIXA INTERNO" }))).toBe("CAIXA INTERNO");
  });
});

describe("obsDaLinha", () => {
  it("observação digitada tem prioridade", () => {
    expect(obsDaLinha(mov({ observacoes: "REF 2 DIARIAS", descricao: "ESPEDITO — X" }))).toBe(
      "REF 2 DIARIAS",
    );
  });
  it("sem observação, mostra o procedimento que está depois do travessão", () => {
    expect(obsDaLinha(mov({ descricao: "CELIA MELO — CONSULTA (CARDIOLOGIA)" }))).toBe(
      "CONSULTA (CARDIOLOGIA)",
    );
  });
  it("descrição sem travessão não vira observação duplicada", () => {
    expect(obsDaLinha(mov({ descricao: "PAO P/SEMANA" }))).toBe("");
  });
});

describe("ordenarCronologico", () => {
  it("ordena por data e depois por hora, do mais antigo para o mais novo", () => {
    const linhas = [
      mov({ data: "2026-09-02", hora: "14:00", descricao: "C" }),
      mov({ data: "2026-09-01", hora: "09:00", descricao: "A" }),
      mov({ data: "2026-09-02", hora: "08:00", descricao: "B" }),
    ];
    expect(ordenarCronologico(linhas).map((l) => l.descricao)).toEqual(["A", "B", "C"]);
  });

  it("não altera o array recebido", () => {
    const linhas = [mov({ data: "2026-09-02" }), mov({ data: "2026-09-01" })];
    ordenarCronologico(linhas);
    expect(linhas[0].data).toBe("2026-09-02");
  });
});

describe("colunasExtrato", () => {
  it("a analítica começa pelas oito colunas que o financeiro pediu, na ordem", () => {
    expect(
      colunasExtrato("analitico")
        .slice(0, 8)
        .map((c) => c.rotulo),
    ).toEqual([
      "Data",
      "Favorecido",
      "Categoria",
      "Banco/Conta",
      "Forma de Pagamento",
      "Obs",
      "Valor Pago",
      "Valor Recebido",
    ]);
  });

  it("as colunas de dinheiro somam no rodapé", () => {
    for (const visao of ["analitico", "sintetico"] as const) {
      const somadas = colunasExtrato(visao)
        .filter((c) => c.somar)
        .map((c) => c.chave);
      expect(somadas).toContain("pago");
      expect(somadas).toContain("recebido");
    }
  });

  it("Pago e Recebido usam moeda-opcional, para a célula sem valor sair em branco", () => {
    const cols = colunasExtrato("analitico");
    expect(cols.find((c) => c.chave === "pago")?.formato).toBe("moeda-opcional");
    expect(cols.find((c) => c.chave === "recebido")?.formato).toBe("moeda-opcional");
  });

  it("toda chave de coluna existe na linha correspondente", () => {
    const movs = [mov({ tipo: "receita", valor: 10 }), mov({ tipo: "despesa", valor: 5 })];
    for (const visao of ["analitico", "sintetico"] as const) {
      const linha = linhasExtrato(movs, visao)[0];
      for (const c of colunasExtrato(visao)) expect(c.chave in linha).toBe(true);
    }
  });
});

describe("linhasAnaliticas", () => {
  const movs = [
    mov({
      data: "2026-09-01",
      hora: "08:10",
      tipo: "receita",
      descricao: "CELIA MELO — CONSULTA (CARDIOLOGIA)",
      valor: 120,
      categoriaNome: "PARTICULAR",
      contaNome: "CAIXA",
      formaPagamento: "Dinheiro",
      fichaNumero: 7,
    }),
    mov({
      data: "2026-09-02",
      hora: "17:40",
      tipo: "despesa",
      descricao: "REPASSE MEDICO — ISIS SERRANO DUARTE (37 ATEND.)",
      medicoNome: "ISIS SERRANO DUARTE",
      valor: 2112.5,
      contaNome: "CAIXA",
      formaPagamento: "PIX",
    }),
  ];

  it("cada valor cai em UMA coluna, e a outra fica nula", () => {
    const [entrada, saida] = linhasAnaliticas(movs);
    expect(entrada.recebido).toBe(120);
    expect(entrada.pago).toBeNull();
    expect(saida.pago).toBe(2112.5);
    expect(saida.recebido).toBeNull();
  });

  it("sai em ordem cronológica, ao contrário da tela de Mov. Caixa", () => {
    const linhas = linhasAnaliticas([...movs].reverse());
    expect(linhas[0].data).toBe("2026-09-01");
    expect(linhas[1].data).toBe("2026-09-02");
  });

  it("a data vai em ISO, para a tela e o papel formatarem igual", () => {
    expect(linhasAnaliticas(movs)[0].data).toBe("2026-09-01");
  });

  it("a ficha sai com três dígitos", () => {
    expect(linhasAnaliticas(movs)[0].ficha).toBe("007");
  });

  it("marca o lançamento retroativo na coluna de situação", () => {
    expect(linhasAnaliticas([mov({ status: "confirmado", retroativo: true })])[0].situacao).toBe(
      "confirmado / retroativo",
    );
  });

  it("lista vazia devolve lista vazia em vez de quebrar", () => {
    expect(linhasAnaliticas([])).toEqual([]);
  });
});

describe("linhasSinteticas", () => {
  const movs = [
    mov({ tipo: "receita", valor: 120, categoriaNome: "PARTICULAR", formaPagamento: "Dinheiro" }),
    mov({ tipo: "receita", valor: 80, categoriaNome: "PARTICULAR", formaPagamento: "PIX" }),
    mov({ tipo: "despesa", valor: 50, categoriaNome: "BOLETOS", formaPagamento: "PIX" }),
    mov({
      tipo: "despesa",
      valor: 2112.5,
      descricao: "REPASSE MEDICO — ISIS (37 ATEND.)",
      formaPagamento: "PIX",
    }),
    mov({ tipo: "despesa", valor: 10, descricao: "PAO P/SEMANA", formaPagamento: "Dinheiro" }),
  ];

  it("agrupa por categoria com entradas, saídas e saldo", () => {
    const linhas = linhasSinteticas(movs);
    expect(linhas.find((l) => l.categoria === "PARTICULAR")).toEqual({
      categoria: "PARTICULAR",
      qtd: 2,
      pago: null,
      recebido: 200,
      saldo: 200,
    });
    expect(linhas.find((l) => l.categoria === "BOLETOS")).toEqual({
      categoria: "BOLETOS",
      qtd: 1,
      pago: 50,
      recebido: null,
      saldo: -50,
    });
  });

  it("o repasse sem categoria vira sua própria linha, não pendência", () => {
    expect(linhasSinteticas(movs).find((l) => l.categoria === "REPASSE MEDICO")?.pago).toBe(2112.5);
  });

  it("ordena pela maior movimentação e joga a pendência para o fim", () => {
    const linhas = linhasSinteticas(movs);
    expect(linhas[0].categoria).toBe("REPASSE MEDICO");
    expect(linhas[linhas.length - 1].categoria).toBe(SEM_CATEGORIA);
  });

  it("a soma das categorias fecha com o total geral", () => {
    const linhas = linhasSinteticas(movs);
    const t = totaisExtrato(movs);
    expect(linhas.reduce((s, l) => s + (Number(l.pago) || 0), 0)).toBe(t.pago);
    expect(linhas.reduce((s, l) => s + (Number(l.recebido) || 0), 0)).toBe(t.recebido);
    expect(linhas.reduce((s, l) => s + Number(l.qtd), 0)).toBe(t.qtd);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(linhasSinteticas([])).toEqual([]);
  });
});

describe("totaisExtrato", () => {
  const movs = [
    mov({ tipo: "receita", valor: 120 }),
    mov({ tipo: "despesa", valor: 50 }),
    mov({ tipo: "transferencia", transferSentido: "saida", valor: 30 }),
    mov({ tipo: "transferencia", transferSentido: "entrada", valor: 10 }),
  ];

  it("separa entradas de saídas e devolve o saldo de custódia", () => {
    const t = totaisExtrato(movs);
    expect({ qtd: t.qtd, pago: t.pago, recebido: t.recebido, saldo: t.saldo }).toEqual({
      qtd: 4,
      pago: 80,
      recebido: 130,
      saldo: 50,
    });
  });

  it("sangria não é despesa: fica fora do resultado do período", () => {
    const t = totaisExtrato(movs);
    expect(t.despesas).toBe(50);
    expect(t.receitas).toBe(120);
    // O saldo de custódia é 50 (leva a sangria); o resultado é 70.
    expect(t.resultado).toBe(70);
    expect(t.transferSaida).toBe(30);
    expect(t.transferEntrada).toBe(10);
  });

  it("nada some ao separar: custódia + resultado reconstroem as colunas", () => {
    const t = totaisExtrato(movs);
    expect(t.despesas + t.transferSaida).toBe(t.pago);
    expect(t.receitas + t.transferEntrada).toBe(t.recebido);
  });

  it("dia sem sangria tem resultado igual ao saldo", () => {
    const t = totaisExtrato([
      mov({ tipo: "receita", valor: 100 }),
      mov({ tipo: "despesa", valor: 40 }),
    ]);
    expect(t.resultado).toBe(t.saldo);
  });

  it("é o MESMO total nas duas visões — é isso que a conferência usa", () => {
    const t = totaisExtrato(movs);
    const analitica = linhasAnaliticas(movs);
    expect(analitica.reduce((s, l) => s + (Number(l.pago) || 0), 0)).toBe(t.pago);
    expect(analitica.reduce((s, l) => s + (Number(l.recebido) || 0), 0)).toBe(t.recebido);
    const sintetica = linhasSinteticas(movs);
    expect(sintetica.reduce((s, l) => s + (Number(l.pago) || 0), 0)).toBe(t.pago);
    expect(sintetica.reduce((s, l) => s + (Number(l.recebido) || 0), 0)).toBe(t.recebido);
  });

  it("centavos não escapam pelo arredondamento", () => {
    expect(totaisExtrato([mov({ valor: 0.1 }), mov({ valor: 0.2 })]).recebido).toBe(0.3);
  });

  it("lista vazia devolve tudo zerado", () => {
    expect(totaisExtrato([])).toEqual({
      qtd: 0,
      pago: 0,
      recebido: 0,
      saldo: 0,
      receitas: 0,
      despesas: 0,
      transferEntrada: 0,
      transferSaida: 0,
      resultado: 0,
    });
  });
});

describe("pagamento misto aberto", () => {
  /** O caso real de 05/09/2026: R$ 187,00, metade espécie, metade crédito. */
  const misto = mov({
    tipo: "receita",
    valor: 187,
    formaPagamento: "Misto (não decomposto)",
    formaCanonica: "misto",
    formasPartes: [
      { forma: "dinheiro", valor: 100 },
      { forma: "credito", valor: 87 },
    ],
  });

  it("o resumo por forma soma cada parte no seu balde", () => {
    const itens = resumoPorForma([misto]);
    expect(itens).toEqual([
      { rotulo: "Recebido em Cartão de Crédito", valor: 87 },
      { rotulo: "Recebido em Dinheiro", valor: 100 },
    ]);
  });

  it("as fatias de entrada também abrem o misto", () => {
    const fatias = fatiasDeEntrada([misto]);
    expect(fatias.find((f) => f.forma === "dinheiro")?.valor).toBe(100);
    expect(fatias.find((f) => f.forma === "credito")?.valor).toBe(87);
    expect(fatias.some((f) => f.forma === "misto")).toBe(false);
  });

  it("a coluna Forma de Pagamento diz de que o misto é feito", () => {
    expect(linhasAnaliticas([misto])[0].forma).toBe("Misto (Dinheiro + Cartão de Crédito)");
  });

  it("o misto que não abre continua sendo 'não decomposto'", () => {
    const opaco = mov({ ...misto, formasPartes: undefined });
    expect(linhasAnaliticas([opaco])[0].forma).toBe("Misto (não decomposto)");
    expect(resumoPorForma([opaco])).toEqual([
      { rotulo: "Recebido em Misto (não decomposto)", valor: 187 },
    ]);
  });

  it("abrir o misto não muda o total do período", () => {
    expect(resumoPorForma([misto]).reduce((s, i) => s + i.valor, 0)).toBe(
      totaisExtrato([misto]).recebido,
    );
  });

  it("suprimento não infla o Recebido em Dinheiro do card", () => {
    const suprimento = mov({
      tipo: "transferencia",
      transferSentido: "entrada",
      valor: 500,
      formaCanonica: "dinheiro",
    });
    const fatias = fatiasDeEntrada([mov({ valor: 100, formaCanonica: "dinheiro" }), suprimento]);
    expect(fatias.find((f) => f.forma === "dinheiro")?.valor).toBe(100);
  });
});

describe("resumoPorForma", () => {
  const movs = [
    mov({ tipo: "receita", valor: 120, formaPagamento: "Dinheiro" }),
    mov({ tipo: "receita", valor: 80, formaPagamento: "PIX" }),
    mov({ tipo: "despesa", valor: 50, formaPagamento: "PIX" }),
    mov({ tipo: "despesa", valor: 10, formaPagamento: "Dinheiro" }),
  ];

  it("separa o que entrou do que saiu, entradas primeiro", () => {
    expect(resumoPorForma(movs)).toEqual([
      { rotulo: "Recebido em Dinheiro", valor: 120 },
      { rotulo: "Recebido em PIX", valor: 80 },
      { rotulo: "Pago em Dinheiro", valor: 10 },
      { rotulo: "Pago em PIX", valor: 50 },
    ]);
  });

  it("forma não usada em um dos sentidos não vira linha de zero", () => {
    const itens = resumoPorForma([mov({ tipo: "receita", valor: 10, formaPagamento: "Boleto" })]);
    expect(itens.some((i) => i.rotulo === "Pago em Boleto")).toBe(false);
  });

  it("lançamento sem forma cadastrada é rotulado, não descartado", () => {
    expect(resumoPorForma([mov({ tipo: "receita", valor: 10, formaPagamento: null })])[0]).toEqual({
      rotulo: "Recebido em (sem forma)",
      valor: 10,
    });
  });

  it("a soma do resumo fecha com o total geral", () => {
    const t = totaisExtrato(movs);
    const itens = resumoPorForma(movs);
    const soma = (prefixo: string) =>
      itens.filter((i) => i.rotulo.startsWith(prefixo)).reduce((s, i) => s + i.valor, 0);
    expect(soma("Recebido")).toBe(t.recebido);
    expect(soma("Pago")).toBe(t.pago);
  });
});
