/**
 * Testes da leitura da planilha do Catálogo de Serviços.
 *
 * Cobrem o que a recepção realmente digita: valor em formato brasileiro,
 * "Sim"/"Não" em várias grafias, categoria no plural e com acento, serviço
 * repetido no arquivo, linha sem nome e o CSV que o próprio botão
 * "Exportar Excel" gera (UTF-8 com BOM e ponto-e-vírgula).
 */
import { describe, expect, it } from "bun:test";
import * as XLSX from "xlsx";

import {
  deduzirCategoria,
  repasseDaLinha,
  unidadeConfere,
  lerPlanilhaServicos,
  normalizarAtivo,
  normalizarCategoria,
  normalizarDuracao,
  normalizarValor,
} from "./importar-servicos";

function csv(texto: string): ArrayBuffer {
  return new TextEncoder().encode("\uFEFF" + texto).buffer as ArrayBuffer;
}

const CABECALHO =
  "Nome;Especialidade;Categoria;Código;Dinheiro (R$);Cartão (R$);Duração (min);Preparo;Ativo;Repasse";

describe("valores em reais", () => {
  it("aceita formato brasileiro, americano, com R$ e vazio", () => {
    expect(normalizarValor("1.234,56")).toBe(1234.56);
    expect(normalizarValor("R$ 1.234,56")).toBe(1234.56);
    expect(normalizarValor("80,00")).toBe(80);
    expect(normalizarValor("1234.56")).toBe(1234.56);
    expect(normalizarValor(90)).toBe(90);
    expect(normalizarValor("")).toBe(0);
    expect(normalizarValor(null)).toBe(0);
    expect(normalizarValor("abc")).toBe(0);
  });

  it("duração vazia ou inválida volta ao padrão de 30 minutos", () => {
    expect(normalizarDuracao("45")).toBe(45);
    expect(normalizarDuracao("")).toBe(30);
    expect(normalizarDuracao("abc")).toBe(30);
    expect(normalizarDuracao(0)).toBe(30);
  });
});

describe("coluna Ativo", () => {
  it("reconhece todas as variações usadas na recepção", () => {
    for (const sim of ["Sim", "S", "Ativo", "1", "true", "", null, undefined, true]) {
      expect(normalizarAtivo(sim)).toBe(true);
    }
    for (const nao of ["Não", "Nao", "N", "Inativo", "0", "false", false]) {
      expect(normalizarAtivo(nao)).toBe(false);
    }
  });
});

describe("categoria", () => {
  it("aceita plural e acento, e recusa o que não existe", () => {
    expect(normalizarCategoria("Consultas")).toBe("consulta");
    expect(normalizarCategoria("EXAMES")).toBe("exame");
    expect(normalizarCategoria("Procedimentos")).toBe("procedimento");
    expect(normalizarCategoria("procedimento")).toBe("procedimento");
    expect(normalizarCategoria("")).toBe("exame");
    expect(normalizarCategoria("Cirurgia")).toBeNull();
  });
});

describe("leitura do CSV com ponto-e-vírgula e BOM", () => {
  it("lê as linhas, coloca em maiúsculas e mantém o preparo como digitado", async () => {
    const r = await lerPlanilhaServicos(
      csv(
        `${CABECALHO}\n` +
          "Consulta cardiologia;Cardiologia;Consultas;C01;150,00;170,00;20;Trazer exames anteriores;Sim;70\n",
      ),
      { nomeArquivo: "servicos.csv", especialidadesExistentes: [] },
    );

    expect(r.recusadas).toEqual([]);
    expect(r.linhas).toHaveLength(1);
    const l = r.linhas[0];
    expect(l.nome).toBe("CONSULTA CARDIOLOGIA");
    expect(l.especialidade).toBe("CARDIOLOGIA");
    expect(l.categoria).toBe("consulta");
    expect(l.codigo).toBe("C01");
    expect(l.valorDinheiro).toBe(150);
    expect(l.valorCartao).toBe(170);
    expect(l.duracaoMinutos).toBe(20);
    expect(l.preparo).toBe("Trazer exames anteriores");
    expect(l.ativo).toBe(true);
    expect(l.repasse).toEqual({ tipo: "valor", valor: 70 });
    expect(l.categoriaDeduzida).toBe(false);
    expect(r.especialidadesNovas).toEqual(["CARDIOLOGIA"]);
  });

  it("não aponta como nova a especialidade que já existe no cadastro", async () => {
    const r = await lerPlanilhaServicos(
      csv(`${CABECALHO}\nRaio X torax;Radiologia;Exame;;50;60;15;;Sim;\n`),
      { nomeArquivo: "servicos.csv", especialidadesExistentes: ["radiologia"] },
    );
    expect(r.especialidadesNovas).toEqual([]);
    expect(r.linhas[0].repasse).toBeNull();
  });
});

describe("problemas apontados linha a linha", () => {
  it("recusa linha sem nome, categoria inválida e repetição dentro da planilha", async () => {
    const r = await lerPlanilhaServicos(
      csv(
        `${CABECALHO}\n` +
          "Ultrassom abdominal;Ultrassonografia;Exames;;120,00;140,00;30;;Sim;\n" +
          ";Radiologia;Exame;;10;10;10;;Sim;\n" +
          "Cirurgia de catarata;Oftalmologia;Cirurgia;;100;100;30;;Sim;\n" +
          "ULTRASSOM ABDOMINAL;Ultrassonografia;Exame;;120;140;30;;Não;\n",
      ),
      { nomeArquivo: "servicos.csv" },
    );

    expect(r.linhas.map((l) => l.nome)).toEqual(["ULTRASSOM ABDOMINAL"]);
    expect(r.recusadas).toHaveLength(3);

    expect(r.recusadas[0].linhaExcel).toBe(3);
    expect(r.recusadas[0].motivo).toContain("sem o nome");

    expect(r.recusadas[1].nome).toBe("CIRURGIA DE CATARATA");
    expect(r.recusadas[1].motivo).toContain("Consulta, Exame ou Procedimento");

    expect(r.recusadas[2].linhaExcel).toBe(5);
    expect(r.recusadas[2].motivo).toContain("linha 2");
  });
});

describe("planilha da São Francisco (ITEM, CLASSE, UNIDADE, VALOR DO MÉDICO)", () => {
  const CLINICA = "POLICLINICA SAO FRANCISCO DE PAULA";

  function xlsx(linhas: (string | number | null)[][]): ArrayBuffer {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), "Plan1");
    return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  }

  const CAB = [
    "UNIDADE",
    "ITEM",
    "GRUPO",
    "SUBGRUPO",
    "CLASSE",
    "VALOR",
    "VALOR DO MÉDICO",
    "VALOR DO SERVIÇO",
    "TERCEIRIZADO",
    "% MÉDICO",
    "% SERVIÇO",
  ];

  it("lê as colunas, filtra a unidade e aplica cartão = valor", async () => {
    const r = await lerPlanilhaServicos(
      xlsx([
        ["TABELA DE ITENS"],
        CAB,
        [
          "SÃO FRANCISCO DE PAULA",
          "Consulta urologia",
          "CONSULTAS",
          "",
          "Urologia",
          150,
          60,
          90,
          0,
          "",
          "",
        ],
        [
          "SÃO FRANCISCO DE PAULA",
          "USG pélvica",
          "EXAMES",
          "IMAGEM",
          "Ginecologia",
          "120,00",
          "",
          "",
          "",
          0.4,
          0.6,
        ],
        ["MENINO JESUS", "Consulta urologia", "CONSULTAS", "", "Urologia", 130, 55, 75, 0, "", ""],
        [
          "SÃO FRANCISCO DE PAULA",
          "Restauração",
          "PROCEDIMENTOS",
          "",
          "Odonto",
          200,
          0,
          150,
          50,
          0,
          0,
        ],
      ]),
      { nomeArquivo: "sfp.xlsx", nomeClinica: CLINICA },
    );

    expect(r.recusadas).toEqual([]);
    expect(r.outrasUnidades).toEqual({ linhas: 1, nomes: ["MENINO JESUS"] });
    expect(r.linhas.map((l) => l.nome)).toEqual([
      "CONSULTA UROLOGIA",
      "USG PÉLVICA",
      "RESTAURAÇÃO",
    ]);

    const [consulta, usg, restauracao] = r.linhas;
    expect(consulta.especialidade).toBe("UROLOGIA");
    expect(consulta.categoria).toBe("consulta");
    expect(consulta.categoriaDeduzida).toBe(true);
    expect(consulta.valorDinheiro).toBe(150);
    expect(consulta.valorCartao).toBe(150);
    expect(consulta.repasse).toEqual({ tipo: "valor", valor: 60 });

    // % com formato de porcentagem no Excel chega como fração.
    expect(usg.repasse).toEqual({ tipo: "percentual", valor: 40 });
    expect(usg.categoria).toBe("exame");

    // Zero nos dois campos não zera comissão: fica sem regra da planilha.
    expect(restauracao.repasse).toBeNull();
    expect(restauracao.categoria).toBe("procedimento");
    expect(restauracao.valorTerceirizado).toBe(50);
  });

  it("planilha de outra unidade não grava nada na clínica aberta", async () => {
    const r = await lerPlanilhaServicos(
      xlsx([
        CAB,
        [
          "SÃO FRANCISCO DE PAULA",
          "Consulta",
          "CONSULTAS",
          "",
          "Clinico geral",
          100,
          50,
          50,
          0,
          "",
          "",
        ],
      ]),
      { nomeArquivo: "sfp.xlsx", nomeClinica: "POLICLINICA MENINO JESUS" },
    );
    expect(r.linhas).toEqual([]);
    expect(r.outrasUnidades.linhas).toBe(1);
  });

  it("unidade: nome parcial confere, palavra genérica não", () => {
    expect(unidadeConfere("SÃO FRANCISCO DE PAULA", CLINICA)).toBe(true);
    expect(unidadeConfere("Policlínica São Francisco", CLINICA)).toBe(true);
    expect(unidadeConfere("", CLINICA)).toBe(true);
    expect(unidadeConfere("POLICLINICA", CLINICA)).toBe(false);
    expect(unidadeConfere("MENINO JESUS", CLINICA)).toBe(false);
  });

  it("repasse: valor fixo vence percentual; zero e vazio não definem regra", () => {
    expect(repasseDaLinha("60,00", "40%")).toEqual({ tipo: "valor", valor: 60 });
    expect(repasseDaLinha("", "40%")).toEqual({ tipo: "percentual", valor: 40 });
    expect(repasseDaLinha(0, 0)).toBeNull();
    expect(repasseDaLinha("", "")).toBeNull();
    expect(repasseDaLinha("", "150")).toBeNull();
  });

  it("categoria deduzida do grupo, subgrupo e nome", () => {
    expect(deduzirCategoria("CONSULTAS", null, "X")).toBe("consulta");
    expect(deduzirCategoria("", "PROCEDIMENTOS CIRURGICOS", "X")).toBe("procedimento");
    expect(deduzirCategoria("LABORATORIO", "", "CONSULTA RETORNO")).toBe("consulta");
    expect(deduzirCategoria("LABORATORIO", "", "HEMOGRAMA")).toBe("exame");
  });
});
