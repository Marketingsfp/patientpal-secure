import { describe, expect, it } from "bun:test";
import { classifyAtendimento } from "./atendimento-classify";

// Todas as descrições abaixo são formatos reais da base de produção.
describe("classifyAtendimento — o que não é atendimento", () => {
  it("não conta parcela de carnê importada do sistema anterior", () => {
    expect(classifyAtendimento("CARLA DA SILVA — CONTRATO")).toBeNull();
    expect(classifyAtendimento("MARCIA CRISTINA MACEDO — CONTRATO")).toBeNull();
  });

  it("não conta mensalidade do cartão", () => {
    expect(
      classifyAtendimento("MENSALIDADE 2/12 - CONTRATO #20261466 - SUZANA DE GOIS GUERRA"),
    ).toBeNull();
  });

  it("não conta adesão nem dependente", () => {
    expect(classifyAtendimento("ADESAO CARTAO CONSULTA — JOAO")).toBeNull();
    expect(classifyAtendimento("DEPENDENTE / ADESÃO CARTAO")).toBeNull();
  });

  it("não conta recebimento avulso do caixa (sem travessão)", () => {
    expect(classifyAtendimento("[CAIXA] RECEBIMENTO")).toBeNull();
    expect(classifyAtendimento("UBER IR SAO F. DE PAULA")).toBeNull();
  });

  it("não quebra com descrição vazia", () => {
    expect(classifyAtendimento(null)).toBeNull();
    expect(classifyAtendimento("")).toBeNull();
  });
});

describe("classifyAtendimento — atendimento particular", () => {
  it("consulta comum é consulta particular", () => {
    expect(classifyAtendimento("MANOELA PIZZOLATO DE SOUZA — CONSULTA (PSICOLOGIA)")).toBe(
      "consulta_particular",
    );
  });

  it("procedimento sem a palavra consulta é exame", () => {
    expect(
      classifyAtendimento(
        "MARIANA BRAZ DA SILVA — RESTAURACAO RESINA FOTOPOLIMERIZAVEL (ODONTOLOGIA)",
      ),
    ).toBe("exame");
    expect(classifyAtendimento("EXPEDITO ALVES DOS SANTOS — EXAMES LABORATORIAIS")).toBe("exame");
  });
});

describe("classifyAtendimento — atendimento pelo cartão", () => {
  it("consulta pelo convênio do cartão é consulta cartão", () => {
    expect(
      classifyAtendimento(
        "JOSE FRANCISCO TEIXEIRA — CONSULTA (CARDIOLOGIA) — CONVENIO CARTAO CONSULTA + SEGUROS (R$ 10,00 DINHEIRO / R$ 9,99 OUTROS)",
      ),
    ).toBe("cartao_consulta");
  });

  it("exame do paciente com cartão continua sendo exame", () => {
    // O nome do convênio contém a palavra CONSULTA; a categoria tem que sair
    // do procedimento, senão todo exame de quem tem cartão vira consulta.
    expect(
      classifyAtendimento(
        "JOAO IVO DA SILVA — EXAMES LABORATORIAIS (LABORATORIO) — CONVENIO CARTAO CONSULTA + SEGUROS (-10%)",
      ),
    ).toBe("exame");
    expect(
      classifyAtendimento(
        "ANGELA MACHADO BULADO FERREIRA — FISIOTERAPIA (5 SESSOES) (FISIOTERAPIA) — CARTAO CONSULTA + SEGUROS (LIMITE ATINGIDO)",
      ),
    ).toBe("exame");
  });

  it("uso avulso do cartão no formato legado", () => {
    expect(classifyAtendimento("JEFERSON LUIZ GONCALVES — CONSULTA CARTAO")).toBe(
      "cartao_consulta",
    );
    expect(classifyAtendimento("EDILEUZA DORALICE DOS SANTOS BARROS — EXAME CARTAO")).toBe("exame");
  });
});
