import { describe, expect, it } from "bun:test";
import * as XLSX from "xlsx";
import {
  agruparAvisos,
  detectarLinhaCabecalho,
  fimDeVigencia,
  inicioContratoDaAba,
  lerPlanilhaBeneficiarios,
  normalizarCpf,
  normalizarData,
  normalizarMatricula,
  normalizarSexo,
  normalizarTelefone,
  normalizarTipo,
  type Aviso,
} from "./importar-beneficiarios";

/**
 * Monta um arquivo no formato do UNIMED_MJ.xlsx. `enfeite` é quantas linhas
 * de título/filtro vêm antes do cabeçalho — no arquivo real esse número muda
 * de aba para aba (2025 tem 5, 2026 tem 6), que foi justamente o que quebrou
 * a primeira versão da leitura.
 */
function planilhaFalsa(
  abas: Record<string, { enfeite: number; linhas: (string | number | null)[][] }>,
): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [nome, { enfeite, linhas }] of Object.entries(abas)) {
    const topo = Array.from({ length: enfeite }, () => ["RELATORIO DE BENEFICIARIOS"]);
    const ws = XLSX.utils.aoa_to_sheet([...topo, ...linhas]);
    XLSX.utils.book_append_sheet(wb, ws, nome);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const CABECALHO = [
  "Nome",
  "CPF",
  "Nascimento",
  "Sexo",
  "TITULAR OU DEPENDENTE?",
  "Matricula",
  "Matrícula Titular",
];

function categorias(avisos: Aviso[]): string[] {
  return [...new Set(avisos.map((a) => a.categoria))];
}

describe("normalização de campos", () => {
  it("aceita CPF com pontuação e recusa o que não tem 11 dígitos", () => {
    expect(normalizarCpf("529.982.247-25")).toBe("52998224725");
    expect(normalizarCpf(52998224725)).toBe("52998224725");
    expect(normalizarCpf("1234567890")).toBeNull(); // zero à esquerda comido pelo Excel
    expect(normalizarCpf("00000000000")).toBeNull();
    expect(normalizarCpf("")).toBeNull();
  });

  it("entende data brasileira, ISO, objeto Date e serial do Excel", () => {
    expect(normalizarData("07/03/1984")).toBe("1984-03-07");
    expect(normalizarData("7/3/84")).toBe("1984-03-07");
    expect(normalizarData("1984-03-07")).toBe("1984-03-07");
    expect(normalizarData(new Date(1984, 2, 7))).toBe("1984-03-07");
    expect(normalizarData(30748)).toBe("1984-03-07");
    expect(normalizarData("sem data")).toBeNull();
  });

  it("converte sexo para os valores aceitos pela tabela de pacientes", () => {
    expect(normalizarSexo("M")).toBe("masculino");
    expect(normalizarSexo("Feminino")).toBe("feminino");
    expect(normalizarSexo("")).toBe("nao_informar");
  });

  it("trata titular, dependente e agregado", () => {
    expect(normalizarTipo("TITULAR")).toBe("titular");
    expect(normalizarTipo("Dependente")).toBe("dependente");
    expect(normalizarTipo("AGREGADO")).toBe("dependente");
    expect(normalizarTipo(null)).toBe("titular"); // coluna vazia não pode virar órfão
  });

  it("aceita telefone com DDD e recusa o que não serve como contato", () => {
    expect(normalizarTelefone("(21) 98765-4321")).toBe("21987654321");
    expect(normalizarTelefone("2134567890")).toBe("2134567890");
    expect(normalizarTelefone("5521987654321")).toBe("21987654321"); // código do país
    expect(normalizarTelefone("987654321")).toBeNull(); // sem DDD
    expect(normalizarTelefone("")).toBeNull();
    expect(normalizarTelefone(null)).toBeNull();
    // Números de enchimento não podem passar por contato de verdade.
    expect(normalizarTelefone("00000000000")).toBeNull();
    expect(normalizarTelefone("21999999999")).toBeNull();
    expect(normalizarTelefone("11888888888")).toBeNull();
  });

  it("descarta matrícula vazia e o lixo que aparece no lugar dela", () => {
    expect(normalizarMatricula("1234")).toBe("1234");
    expect(normalizarMatricula("1234.0")).toBe("1234");
    expect(normalizarMatricula("")).toBeNull();
    expect(normalizarMatricula("   ")).toBeNull();
    expect(normalizarMatricula("-")).toBeNull();
    expect(normalizarMatricula(0)).toBeNull();
    expect(normalizarMatricula("000")).toBeNull();
    expect(normalizarMatricula("N/A")).toBeNull();
    expect(normalizarMatricula("SEM TITULAR")).toBeNull();
  });
});

describe("detecção da linha de cabeçalho", () => {
  it("acha o cabeçalho mesmo com número variável de linhas antes", () => {
    const matriz = [
      ["POLICLINICA", null],
      [null, null],
      ["Nome", "Matricula"],
    ];
    expect(detectarLinhaCabecalho(matriz)).toBe(2);
  });

  it("exige Nome e Matrícula: linha só com Nome não serve", () => {
    expect(detectarLinhaCabecalho([["Nome", "Endereco"]])).toBeNull();
  });

  it("prefere a linha mais completa quando há mais de uma candidata", () => {
    const matriz = [
      ["Nome", "Matricula"],
      ["Nome", "CPF", "Nascimento", "Sexo", "TITULAR OU DEPENDENTE?", "Matricula"],
    ];
    expect(detectarLinhaCabecalho(matriz)).toBe(1);
  });

  it("devolve null quando não existe cabeçalho reconhecível", () => {
    expect(detectarLinhaCabecalho([["a", "b"], ["c"]])).toBeNull();
  });
});

describe("leitura da planilha", () => {
  it("lê abas com cabeçalhos em linhas diferentes (o caso do arquivo real)", async () => {
    const arquivo = planilhaFalsa({
      // aba 2025: cabeçalho na linha 6 do Excel (5 linhas de enfeite)
      "2025": {
        enfeite: 5,
        linhas: [
          CABECALHO,
          ["Maria Souza", "529.982.247-25", "07/03/1984", "F", "TITULAR", "1001", null],
          ["Pedro Souza", null, "10/10/2010", "M", "DEPENDENTE", "1002", "1001"],
        ],
      },
      // aba 2026: cabeçalho na linha 7 do Excel (6 linhas de enfeite)
      "2026": {
        enfeite: 6,
        linhas: [
          CABECALHO,
          ["Joao Lima", null, "01/02/1970", "M", "TITULAR", "2001", null],
          ["Ana Lima", null, "05/06/2005", "F", "DEPENDENTE", "2002", "2001"],
        ],
      },
    });

    const r = await lerPlanilhaBeneficiarios(arquivo);

    expect(r.abas.map((a) => a.linhaCabecalho)).toEqual([6, 7]);
    expect(r.titulares.map((t) => t.nome)).toEqual(["Maria Souza", "Joao Lima"]);
    expect(r.dependentes.map((d) => d.nome)).toEqual(["Pedro Souza", "Ana Lima"]);
    expect(r.orfaos).toHaveLength(0);
    expect(r.titulares[0].nascimento).toBe("1984-03-07");
    expect(r.titulares[0].cpf).toBe("52998224725");
    expect(r.dependentes[0].matriculaTitular).toBe("1001");
    // A linha do Excel informada tem que bater com o deslocamento de cada aba.
    expect(r.titulares[0].linhaExcel).toBe(7);
    expect(r.titulares[1].linhaExcel).toBe(8);
  });

  it("ignora dependente sem Matrícula Titular e continua com os demais", async () => {
    const arquivo = planilhaFalsa({
      "2025": {
        enfeite: 6,
        linhas: [
          CABECALHO,
          ["Maria Souza", null, "07/03/1984", "F", "TITULAR", "1001", null],
          ["Filho Sem Titular", null, "10/10/2010", "M", "DEPENDENTE", "1002", null],
          ["Outro Sem Titular", null, "11/11/2011", "F", "DEPENDENTE", "1003", "   "],
          ["Filho Certo", null, "12/12/2012", "M", "DEPENDENTE", "1004", "1001"],
        ],
      },
    });

    const r = await lerPlanilhaBeneficiarios(arquivo, ["2025"]);

    // O dependente bom entra; os sem titular saem sem derrubar a leitura.
    expect(r.dependentes.map((d) => d.nome)).toEqual(["Filho Certo"]);
    expect(r.orfaos).toHaveLength(2);
    expect(r.orfaos.every((o) => o.motivo === "sem-titular-informado")).toBe(true);
    expect(categorias(r.avisos)).toContain("Dependente sem titular informado");
    expect(r.titulares).toHaveLength(1);
  });

  it("separa quem tem titular informado mas inexistente de quem não tem titular", async () => {
    const arquivo = planilhaFalsa({
      "2025": {
        enfeite: 6,
        linhas: [
          CABECALHO,
          ["Maria Souza", null, "07/03/1984", "F", "TITULAR", "1001", null],
          ["Sem Nada", null, "10/10/2010", "M", "DEPENDENTE", "1002", null],
          ["Aponta Errado", null, "10/10/2010", "M", "DEPENDENTE", "1003", "9999"],
        ],
      },
    });

    const r = await lerPlanilhaBeneficiarios(arquivo, ["2025"]);

    expect(r.orfaos.map((o) => o.motivo)).toEqual([
      "sem-titular-informado",
      "titular-nao-encontrado",
    ]);
    expect(categorias(r.avisos)).toEqual(
      expect.arrayContaining(["Dependente sem titular informado", "Titular não encontrado"]),
    );
  });

  it("mantém a primeira linha quando a matrícula repete e zera o CPF repetido", async () => {
    const arquivo = planilhaFalsa({
      "2025": {
        enfeite: 6,
        linhas: [
          CABECALHO,
          ["Primeira Pessoa", "529.982.247-25", "07/03/1984", "F", "TITULAR", "1001", null],
          ["Segunda Pessoa", null, "08/03/1984", "M", "TITULAR", "1001", null],
          ["Terceira Pessoa", "529.982.247-25", "09/03/1984", "M", "TITULAR", "1003", null],
        ],
      },
    });

    const r = await lerPlanilhaBeneficiarios(arquivo, ["2025"]);

    expect(r.titulares.map((t) => t.nome)).toEqual(["Primeira Pessoa", "Terceira Pessoa"]);
    expect(r.titulares[0].cpf).toBe("52998224725");
    expect(r.titulares[1].cpf).toBeNull(); // CPF já usado pela primeira linha
    expect(categorias(r.avisos)).toEqual(
      expect.arrayContaining(["Matrícula repetida", "CPF repetido"]),
    );
  });

  it("lê a coluna de telefone quando existe e devolve null quando não dá para usar", async () => {
    const cabecalhoComTelefone = [
      "Nome",
      "CPF",
      "Telefone",
      "Nascimento",
      "Sexo",
      "TITULAR OU DEPENDENTE?",
      "Matricula",
      "Matrícula Titular",
    ];
    const arquivo = planilhaFalsa({
      "2025": {
        enfeite: 6,
        linhas: [
          cabecalhoComTelefone,
          ["Com Celular", null, "(21) 98765-4321", "07/03/1984", "F", "TITULAR", "1001", null],
          ["Sem Nada", null, null, "07/03/1984", "M", "TITULAR", "1002", null],
          ["So Ddd Faltando", null, "98765432", "07/03/1984", "M", "TITULAR", "1003", null],
        ],
      },
    });

    const r = await lerPlanilhaBeneficiarios(arquivo, ["2025"]);

    expect(r.titulares[0].telefone).toBe("21987654321");
    expect(r.titulares[1].telefone).toBeNull();
    expect(r.titulares[2].telefone).toBeNull();
    expect(r.abas[0].colunas.Telefone).toBe("Telefone");
  });

  it("não quebra quando a planilha não tem coluna de telefone", async () => {
    const arquivo = planilhaFalsa({
      "2025": {
        enfeite: 6,
        linhas: [CABECALHO, ["Maria Souza", null, "07/03/1984", "F", "TITULAR", "1001", null]],
      },
    });

    const r = await lerPlanilhaBeneficiarios(arquivo, ["2025"]);

    expect(r.titulares).toHaveLength(1);
    expect(r.titulares[0].telefone).toBeNull();
    expect(r.abas[0].colunas.Telefone).toBeNull();
  });

  it("avisa quando a aba pedida não existe em vez de falhar", async () => {
    const arquivo = planilhaFalsa({ "2025": { enfeite: 6, linhas: [CABECALHO] } });
    const r = await lerPlanilhaBeneficiarios(arquivo, ["2025", "2026"]);
    expect(categorias(r.avisos)).toContain("Aba não encontrada");
  });

  it("avisa quando a aba existe mas não tem cabeçalho reconhecível", async () => {
    const arquivo = planilhaFalsa({
      "2025": { enfeite: 3, linhas: [["Relatorio", "sem", "tabela"]] },
    });
    const r = await lerPlanilhaBeneficiarios(arquivo, ["2025"]);
    expect(categorias(r.avisos)).toContain("Cabeçalho não encontrado");
    expect(r.abas[0].linhaCabecalho).toBeNull();
    expect(r.linhas).toHaveLength(0);
  });
});

describe("agrupamento de avisos", () => {
  it("junta por categoria e ordena do assunto mais frequente para o menos", () => {
    const grupos = agruparAvisos([
      { categoria: "Sem matrícula", mensagem: "a" },
      { categoria: "Dependente sem titular informado", mensagem: "b" },
      { categoria: "Dependente sem titular informado", mensagem: "c" },
      { categoria: "Dependente sem titular informado", mensagem: "d" },
    ]);
    expect(grupos.map((g) => [g.categoria, g.quantidade])).toEqual([
      ["Dependente sem titular informado", 3],
      ["Sem matrícula", 1],
    ]);
    expect(grupos[0].mensagens).toEqual(["b", "c", "d"]);
  });
});

describe("datas do contrato", () => {
  it("usa 1º de janeiro do ano da aba", () => {
    expect(inicioContratoDaAba("2025", "2026-08-18")).toBe("2025-01-01");
    expect(inicioContratoDaAba("Ativos", "2026-08-18")).toBe("2026-08-18");
  });

  it("fecha a vigência um dia antes de completar os meses", () => {
    expect(fimDeVigencia("2025-01-01", 12)).toBe("2025-12-31");
    expect(fimDeVigencia("2026-03-15", 6)).toBe("2026-09-14");
  });
});
