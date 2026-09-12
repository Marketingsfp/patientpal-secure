/**
 * Testes da leitura da planilha do Catálogo de Serviços.
 *
 * Cobrem o que a recepção realmente digita: valor em formato brasileiro,
 * "Sim"/"Não" em várias grafias, categoria no plural e com acento, serviço
 * repetido no arquivo, linha sem nome e o CSV que o próprio botão
 * "Exportar Excel" gera (UTF-8 com BOM e ponto-e-vírgula).
 */
import { describe, expect, it } from "bun:test";

import {
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
    expect(l.repasse).toBe(70);
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
