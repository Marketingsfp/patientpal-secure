import { describe, expect, it } from "bun:test";
import { sugerirPreparos, type PreparoId } from "./orcamento-preparos";

// Nomes reais do cadastro de exames de laboratório em produção.
describe("sugerirPreparos", () => {
  it.each([
    ["PSA LIVRE + TOTAL", ["psa"]],
    ["EAS (URINA TIPO I)", ["urina_eas"]],
    ["ROTINA DE URINA (EAS)", ["urina_eas"]],
    ["UROCULTURA", ["urina_cultura"]],
    ["CULTURA URINA", ["urina_cultura"]],
    ["CONTAGEM DE COLONIA CULTURA EM URINA COM", ["urina_cultura"]],
    ["PROTEINURIA URINA DE 24 HORAS", ["urina_24h"]],
    ["CREATININA (URINA 24H)", ["urina_24h"]],
    ["PARASITOLOGICO DE FEZES (EPF)", ["fezes_1"]],
    ["POP", ["fezes_1"]],
    ["MIF (PARASITOLOGICO DAS FEZES COLHEITA MULTIPLA)", ["fezes_3"]],
    ["PARASITOLOGICO COLHEITA MULTIPLA COM LIQ.CONSERVANTE", ["fezes_3"]],
    ["HEMOGRAMA COMPLETO", []],
    ["GLICOSE", []],
  ] as [string, PreparoId[]][])("%s", (nome, esperado) => {
    expect(sugerirPreparos(nome)).toEqual(esperado);
  });
});
