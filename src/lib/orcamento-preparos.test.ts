import { describe, expect, it } from "bun:test";
import {
  alternarPreparoNoTexto,
  preparosNoTexto,
  sugerirPreparos,
  textoSemPreparos,
  type PreparoId,
} from "./orcamento-preparos";

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

describe("preparo nas Observações", () => {
  it("marca, desmarca e preserva o texto digitado", () => {
    let t = "LEVAR PEDIDO MEDICO";
    t = alternarPreparoNoTexto(t, "jejum_8h", true);
    t = alternarPreparoNoTexto(t, "psa", true);
    expect(t).toBe(
      "LEVAR PEDIDO MEDICO\nJejum de 8 horas\nAbstinência Sexual, não praticar esportes, não fazer esforço físico, por 2 dias (PSA)",
    );
    t = alternarPreparoNoTexto(t, "jejum_8h", false);
    expect([...preparosNoTexto(t)]).toEqual(["psa"]);
    expect(textoSemPreparos(t)).toBe("LEVAR PEDIDO MEDICO");
  });

  it("marcar duas vezes não duplica a linha", () => {
    const t = alternarPreparoNoTexto(
      alternarPreparoNoTexto("", "urina_eas", true),
      "urina_eas",
      true,
    );
    expect(t).toBe("1ª Urina do dia (EAS)");
  });

  it("reconhece o texto como o banco grava (maiúsculas, sem acento)", () => {
    const gravado =
      "JEJUM DE 8 HORAS\n1ª URINA DO DIA, COM GELO EM VOLTA DO RECIPIENTE (CULTURA)\nABSTINENCIA SEXUAL, NAO PRATICAR ESPORTES, NAO FAZER ESFORCO FISICO, POR 2 DIAS (PSA)\nTRAZER RECIPIENTE";
    expect([...preparosNoTexto(gravado)].sort()).toEqual(["jejum_8h", "psa", "urina_cultura"]);
    expect(textoSemPreparos(gravado)).toBe("TRAZER RECIPIENTE");
  });
});
