import { describe, expect, it } from "bun:test";
import { prepararBuscaCatalogo, expansoesDeEscrita } from "../catalogo-busca";
import { confirmarAntesDeEncaminhar } from "../catalogo-sem-registro";
import { encaminharAposEsclarecimento } from "../catalogo-esclarecimento";
import { validarResultado } from "../tool-broker";
import { selectThinkingLevel } from "../reasoning-router";

// Nomes fictícios no formato do cadastro publicado da MJ.
const SERVICOS = [
  "USG ABDOMINAL TOTAL",
  "USG TIREOIDE",
  "USG TRANSVAGINAL COM DOPPLER",
  "ECOCARDIOGRAMA (ADULTO)",
  "ELETROCARDIOGRAMA",
];
const ESPECIALIDADES = ["CARDIOLOGIA", "UROLOGIA", "CLINICO GERAL", "NUTRICAO", "PEDIATRIA"];
const todos = [...SERVICOS, ...ESPECIALIDADES];
const acha = (q: string, nome: string) => prepararBuscaCatalogo(q, todos).pontuar(nome, "") > 0;

describe("termos populares, siglas e erros de digitação", () => {
  it.each([
    ["usam", "USG ABDOMINAL TOTAL"],
    ["usg abdome", "USG ABDOMINAL TOTAL"],
    ["ultrassom da barriga", "USG ABDOMINAL TOTAL"],
    ["ultrassom de abdome total", "USG ABDOMINAL TOTAL"],
    ["ultrass transvaginal", "USG TRANSVAGINAL COM DOPPLER"],
    ["cardilogia", "CARDIOLOGIA"],
    ["urulogista", "UROLOGIA"],
    ["clinico geral", "CLINICO GERAL"],
    ["nutricionista", "NUTRICAO"],
    ["médico de criança", "PEDIATRIA"],
    ["eletro", "ELETROCARDIOGRAMA"],
  ])("%s → %s", (q, nome) => expect(acha(q, nome)).toBe(true));

  it("transesofágico continua não casando com eco transtorácico", () => {
    expect(acha("ecocardiograma transesofagico", "ECOCARDIOGRAMA (ADULTO)")).toBe(false);
  });

  it("registra o termo interpretado", () => {
    expect(expansoesDeEscrita("usam")).toEqual([
      { original: "usam", interpretado: "ultrassonografia" },
    ]);
  });

  it("citar exame/sigla não usa raciocínio LOW", () => {
    expect(selectThinkingLevel({ mensagem: "Usam" } as never).nivel).toBe("medium");
  });
});

describe("sem resultado: pergunta antes de transferir", () => {
  const vazio = validarResultado("buscar_procedimentos", {
    ok: true,
    source: "nina_catalogo",
    knowledge_status: "not_found",
    found: false,
    records: [],
  });
  it("primeira falha vira pergunta, sem transferência", () => {
    const r = confirmarAntesDeEncaminhar(vazio, { termo: "xyzexame" }, null);
    const e = (r.dados as { esclarecimento?: { motivo?: string; pergunta: string } })
      .esclarecimento;
    expect(e?.motivo).toBe("sem_registro_confirmar");
    expect(e?.pergunta).toContain("xyzexame");
  });
  it("segunda falha encaminha", () => {
    const anterior = {
      versao: 1 as const,
      clinicaId: "c",
      sessionId: "s",
      consulta: { termo: "xyzexame" },
      referencias: [],
      esclarecimento: {
        tipo: "sigla" as const,
        motivo: "sem_registro_confirmar" as const,
        pergunta: "Você quis dizer?",
        opcoes: [],
      },
    };
    expect(confirmarAntesDeEncaminhar(vazio, { termo: "xyz" }, anterior)).toBe(vazio);
    expect(encaminharAposEsclarecimento(anterior as never, vazio, "xyz")?.motivo).toContain(
      "CATALOGO_SEM_REGISTRO",
    );
  });
});
