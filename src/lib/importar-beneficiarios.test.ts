import { describe, expect, it } from "bun:test";
import * as XLSX from "xlsx";
import {
  fimDeVigencia,
  inicioContratoDaAba,
  lerPlanilhaBeneficiarios,
  normalizarCpf,
  normalizarData,
  normalizarSexo,
  normalizarTipo,
} from "./importar-beneficiarios";

/**
 * Monta um arquivo igual ao UNIMED_MJ.xlsx: seis linhas de enfeite antes do
 * cabeçalho real, que fica na linha 7 da tela do Excel.
 */
function planilhaFalsa(abas: Record<string, (string | number | null)[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [nome, linhas] of Object.entries(abas)) {
    const enfeite = Array.from({ length: 6 }, () => ["RELATORIO DE BENEFICIARIOS"]);
    const ws = XLSX.utils.aoa_to_sheet([...enfeite, ...linhas]);
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
});

describe("leitura da planilha", () => {
  it("pula as 6 primeiras linhas, junta as duas abas e separa titular de dependente", async () => {
    const arquivo = planilhaFalsa({
      "2025": [
        CABECALHO,
        ["Maria Souza", "529.982.247-25", "07/03/1984", "F", "TITULAR", "1001", null],
        ["Pedro Souza", null, "10/10/2010", "M", "DEPENDENTE", "1002", "1001"],
      ],
      "2026": [
        CABECALHO,
        ["Joao Lima", null, "01/02/1970", "M", "TITULAR", "2001", null],
        ["Ana Lima", null, "05/06/2005", "F", "DEPENDENTE", "2002", "2001"],
      ],
    });

    const r = await lerPlanilhaBeneficiarios(arquivo);

    expect(r.titulares.map((t) => t.nome)).toEqual(["Maria Souza", "Joao Lima"]);
    expect(r.dependentes.map((d) => d.nome)).toEqual(["Pedro Souza", "Ana Lima"]);
    expect(r.orfaos).toHaveLength(0);
    expect(r.titulares[0].matricula).toBe("1001");
    expect(r.titulares[0].nascimento).toBe("1984-03-07");
    expect(r.titulares[0].cpf).toBe("52998224725");
    expect(r.dependentes[0].matriculaTitular).toBe("1001");
    expect(r.abas.map((a) => a.nome)).toEqual(["2025", "2026"]);
  });

  it("separa dependente cujo titular não está no arquivo", async () => {
    const arquivo = planilhaFalsa({
      "2025": [
        CABECALHO,
        ["Maria Souza", null, "07/03/1984", "F", "TITULAR", "1001", null],
        ["Orfao Silva", null, "10/10/2010", "M", "DEPENDENTE", "1002", "9999"],
      ],
    });

    const r = await lerPlanilhaBeneficiarios(arquivo, ["2025"]);

    expect(r.dependentes).toHaveLength(0);
    expect(r.orfaos.map((o) => o.nome)).toEqual(["Orfao Silva"]);
    expect(r.avisos.some((a) => a.includes("Orfao Silva"))).toBe(true);
  });

  it("mantém a primeira linha quando a matrícula repete e zera o CPF repetido", async () => {
    const arquivo = planilhaFalsa({
      "2025": [
        CABECALHO,
        ["Primeira Pessoa", "529.982.247-25", "07/03/1984", "F", "TITULAR", "1001", null],
        ["Segunda Pessoa", null, "08/03/1984", "M", "TITULAR", "1001", null],
        ["Terceira Pessoa", "529.982.247-25", "09/03/1984", "M", "TITULAR", "1003", null],
      ],
    });

    const r = await lerPlanilhaBeneficiarios(arquivo, ["2025"]);

    expect(r.titulares.map((t) => t.nome)).toEqual(["Primeira Pessoa", "Terceira Pessoa"]);
    expect(r.titulares[0].cpf).toBe("52998224725");
    expect(r.titulares[1].cpf).toBeNull(); // CPF já usado pela primeira linha
    expect(r.avisos.some((a) => a.includes("CPF repetido"))).toBe(true);
  });

  it("avisa quando a aba pedida não existe em vez de falhar", async () => {
    const arquivo = planilhaFalsa({ "2025": [CABECALHO] });
    const r = await lerPlanilhaBeneficiarios(arquivo, ["2025", "2026"]);
    expect(r.avisos.some((a) => a.includes("2026"))).toBe(true);
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
