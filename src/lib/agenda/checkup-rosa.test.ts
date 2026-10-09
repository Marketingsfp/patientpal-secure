import { describe, expect, it } from "bun:test";
import {
  checkupRosaVigente,
  detectarCheckupRosa,
  itemCheckupRosa,
  ratearPacote,
} from "./checkup-rosa";

const OUTUBRO = "2026-10-15";
const NOVEMBRO = "2026-11-03";

const consulta = { id: "c", procedimento: "CONSULTA (GINECOLOGIA)", dia: OUTUBRO };
const preventivo = { id: "p", procedimento: "PREVENTIVO (GINECOLOGIA)", dia: OUTUBRO };
const transvaginal = { id: "t", procedimento: "USG TRANSVAGINAL (ULTRASSONOGRAFIA)", dia: OUTUBRO };
const usgMama = { id: "u", procedimento: "USG MAMA (ULTRASSONOGRAFIA)", dia: OUTUBRO };
const mamografia = { id: "m", procedimento: "MAMOGRAFIA", dia: OUTUBRO };

describe("itemCheckupRosa", () => {
  it("reconhece os nomes gravados na agenda", () => {
    expect(itemCheckupRosa("PREVENTIVO (GINECOLOGIA)")).toBe("preventivo");
    expect(itemCheckupRosa("USG TRANSVAGINAL (ULTRASSONOGRAFIA)")).toBe("transvaginal");
    expect(itemCheckupRosa("USG MAMA (ULTRASSONOGRAFIA)")).toBe("usg_mama");
    expect(itemCheckupRosa("MAMOGRAFIA (MAMOGRAFIA)")).toBe("mamografia");
  });

  it("consulta só entra quando é de ginecologia", () => {
    expect(itemCheckupRosa("CONSULTA (GINECOLOGIA)")).toBe("consulta");
    expect(itemCheckupRosa("CONSULTA", "GINECOLOGIA")).toBe("consulta");
    expect(itemCheckupRosa("CONSULTA", "CARDIOLOGIA")).toBeNull();
    expect(itemCheckupRosa("CONSULTA (CARDIOLOGIA)")).toBeNull();
  });

  it("variações que não são o item do pacote ficam de fora", () => {
    expect(itemCheckupRosa("PREVENTIVO DE FORA")).toBeNull();
    expect(itemCheckupRosa("PREVENTIVO EXTERNO")).toBeNull();
    expect(itemCheckupRosa("USG TRANSVAGINAL COM DOPPLER (ULTRASSONOGRAFIA)")).toBeNull();
    expect(itemCheckupRosa("USG MAMA MASCULINA (ULTRASSONOGRAFIA)")).toBeNull();
  });
});

describe("detectarCheckupRosa", () => {
  it("monta os quatro pacotes com os totais da tabela", () => {
    const basico = detectarCheckupRosa([consulta, preventivo, transvaginal]);
    expect(basico?.pacote.id).toBe("basico");
    expect([basico?.totalDinheiro, basico?.totalCartao]).toEqual([222, 265]);

    const prevencao = detectarCheckupRosa([consulta, preventivo, mamografia]);
    expect(prevencao?.pacote.id).toBe("prevencao");
    expect([prevencao?.totalDinheiro, prevencao?.totalCartao]).toEqual([257, 310]);

    const essencial = detectarCheckupRosa([consulta, preventivo, usgMama, mamografia]);
    expect(essencial?.pacote.id).toBe("essencial");
    expect([essencial?.totalDinheiro, essencial?.totalCartao]).toEqual([371, 445]);

    const completo = detectarCheckupRosa([mamografia, usgMama, transvaginal, preventivo, consulta]);
    expect(completo?.pacote.id).toBe("completo");
    expect([completo?.totalDinheiro, completo?.totalCartao]).toEqual([463, 543]);
  });

  it("preventivo sai a zero em qualquer pacote", () => {
    const r = detectarCheckupRosa([consulta, preventivo, transvaginal]);
    expect(r?.precoPorAtendimento.p).toEqual({ dinheiro: 0, cartao: 0 });
  });

  it("não aplica com item faltando, sobrando ou repetido", () => {
    expect(detectarCheckupRosa([consulta, transvaginal])).toBeNull();
    expect(detectarCheckupRosa([consulta, preventivo])).toBeNull();
    expect(
      detectarCheckupRosa([
        consulta,
        preventivo,
        transvaginal,
        { id: "x", procedimento: "HEMOGRAMA", dia: OUTUBRO },
      ]),
    ).toBeNull();
    expect(
      detectarCheckupRosa([consulta, preventivo, transvaginal, { ...transvaginal, id: "t2" }]),
    ).toBeNull();
  });
});

describe("vigência da campanha (outubro de 2026)", () => {
  it("vale de 01/10 a 31/10, inclusive, e aceita data com hora", () => {
    expect(checkupRosaVigente("2026-10-01")).toBe(true);
    expect(checkupRosaVigente("2026-10-31T18:30")).toBe(true);
    expect(checkupRosaVigente("2026-09-30")).toBe(false);
    expect(checkupRosaVigente("2026-11-01")).toBe(false);
    expect(checkupRosaVigente("")).toBe(false);
    expect(checkupRosaVigente(null)).toBe(false);
  });

  it("atendimento fora de outubro não forma pacote", () => {
    expect(
      detectarCheckupRosa([consulta, preventivo, { ...transvaginal, dia: NOVEMBRO }]),
    ).toBeNull();
    expect(
      detectarCheckupRosa([
        { ...consulta, dia: NOVEMBRO },
        { ...preventivo, dia: NOVEMBRO },
        { ...transvaginal, dia: NOVEMBRO },
      ]),
    ).toBeNull();
  });
});

describe("ratearPacote", () => {
  const completo = detectarCheckupRosa([consulta, preventivo, transvaginal, usgMama, mamografia])!;
  const ids = ["c", "p", "t", "u", "m"];

  it("dinheiro: cada atendimento com o preço da coluna D", () => {
    expect(ratearPacote(completo, ids, 463)).toEqual([120, 0, 102, 114, 127]);
  });

  it("cartão: cada atendimento com o preço da coluna C", () => {
    expect(ratearPacote(completo, ids, 543)).toEqual([145, 0, 120, 135, 143]);
  });

  it("outro total cai na proporção e fecha no centavo", () => {
    const v = ratearPacote(completo, ids, 500);
    expect(v[1]).toBe(0);
    expect(Math.round(v.reduce((s, x) => s + x, 0) * 100) / 100).toBe(500);
  });
});
