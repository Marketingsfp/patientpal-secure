import { describe, expect, it } from "bun:test";
import { fichaExigeOrcamento, indexarServicos } from "./orcamento-obrigatorio";

const idx = indexarServicos([
  { id: "1", nome: "CONSULTA", tipo: "consulta", grupo: "CARDIOLOGIA" },
  { id: "2", nome: "USG MAMA", tipo: "exame", grupo: "ULTRASSONOGRAFIA" },
  { id: "3", nome: "INFILTRACAO (CADA)", tipo: "procedimento", grupo: "ORTOPEDIA" },
  { id: "4", nome: "HEMOGRAMA", tipo: "exame", grupo: "LABORATORIO" },
  { id: "5", nome: "GLICEMIA", tipo: "exame", grupo: "LABORATORIO" },
  // Cadastro ambíguo de verdade: mesmo nome e especialidade, tipos diferentes.
  { id: "6", nome: "RISCO CIRURGICO", tipo: "exame", grupo: "CARDIOLOGIA" },
  { id: "7", nome: "RISCO CIRURGICO", tipo: "consulta", grupo: "CARDIOLOGIA" },
  // Mesmo nome, especialidades diferentes: a da ficha decide.
  { id: "8", nome: "BIOIMPEDANCIA", tipo: "consulta", grupo: "NUTRIÇÃO" },
  { id: "9", nome: "BIOIMPEDANCIA", tipo: "exame", grupo: "ENDOCRINOLOGIA" },
]);

const ficha = (
  procedimento: string,
  extra: Partial<Parameters<typeof fichaExigeOrcamento>[0]> = {},
) =>
  fichaExigeOrcamento(
    {
      procedimento,
      tipo_atendimento: "particular",
      temOrcamento: false,
      jaRecebeu: false,
      ...extra,
    },
    idx,
  );

describe("fichaExigeOrcamento", () => {
  it("exame e procedimento particulares sem orçamento são barrados", () => {
    expect(ficha("USG MAMA (ULTRASSONOGRAFIA)")).toBe(true);
    expect(ficha("INFILTRACAO (CADA) (ORTOPEDIA)")).toBe(true);
  });

  it("consulta segue livre", () => {
    expect(ficha("CONSULTA (CARDIOLOGIA)")).toBe(false);
  });

  it("com orçamento ligado, a cobrança passa", () => {
    expect(ficha("USG MAMA (ULTRASSONOGRAFIA)", { temOrcamento: true })).toBe(false);
  });

  it("convênio fica fora da trava", () => {
    expect(ficha("USG MAMA (ULTRASSONOGRAFIA)", { tipo_atendimento: "convenio" })).toBe(false);
  });

  it("saldo de pagamento parcial já iniciado continua podendo ser quitado", () => {
    expect(ficha("USG MAMA (ULTRASSONOGRAFIA)", { jaRecebeu: true })).toBe(false);
  });

  it("cadastro ambíguo não trava o caixa", () => {
    expect(ficha("RISCO CIRURGICO (CARDIOLOGIA)")).toBe(false);
    expect(ficha("RISCO CIRURGICO")).toBe(false);
  });

  it("a especialidade da ficha escolhe o cadastro, sem ligar para acento", () => {
    expect(ficha("BIOIMPEDANCIA (NUTRICAO)")).toBe(false);
    expect(ficha("BIOIMPEDANCIA (ENDOCRINOLOGIA)")).toBe(true);
  });

  it("laboratório concatenado é barrado", () => {
    expect(ficha("HEMOGRAMA + GLICEMIA")).toBe(true);
  });

  it("serviço desconhecido ou ficha sem serviço não trava", () => {
    expect(ficha("ALGO QUE NAO EXISTE (X)")).toBe(false);
    expect(ficha("")).toBe(false);
  });
});
