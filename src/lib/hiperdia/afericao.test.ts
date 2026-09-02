import { describe, expect, it } from "bun:test";
import {
  classificarGlicemiaJejum,
  classificarGlicemiaPos,
  classificarPressao,
  formatarPA,
  validarAfericao,
  type AfericaoDigitada,
} from "./afericao";
import { calcularImc, classificarImc } from "@/lib/triagem/sinais-vitais";

const base: AfericaoDigitada = {
  data_registro: "2026-09-01T10:00",
  pressao_sistolica: "",
  pressao_diastolica: "",
  glicemia_jejum: "",
  glicemia_pos_prandial: "",
  peso: "",
  observacoes: "",
};

describe("pressão arterial — o caso que motivou a correção", () => {
  it("12/9 nunca é classificado como pressão baixa", () => {
    const c = classificarPressao(12, 9);
    expect(c?.tom).toBe("invalido");
    expect(c?.label).not.toContain("baixa");
    // A tela sugere a leitura correta em mmHg em vez de rotular o quadro.
    expect(c?.label).toContain("120/90");
  });

  it("diastólica de 90 mmHg é hipertensão estágio 1", () => {
    expect(classificarPressao(120, 90)?.label).toBe("Hipertensão estágio 1");
    expect(classificarPressao(135, 90)?.label).toBe("Hipertensão estágio 1");
  });

  it("digitar em cmHg é barrado antes de gravar, com a conversão na mensagem", () => {
    const v = validarAfericao({ ...base, pressao_sistolica: "12", pressao_diastolica: "9" });
    expect(v.erro).toContain("mmHg");
    expect(v.erro).toContain("120/90");
  });
});

describe("pressão arterial — faixas da SBC", () => {
  it("classifica cada faixa", () => {
    expect(classificarPressao(110, 70)?.label).toBe("Normal");
    expect(classificarPressao(132, 82)?.label).toBe("Pré-hipertensão");
    expect(classificarPressao(120, 86)?.label).toBe("Pré-hipertensão");
    expect(classificarPressao(145, 88)?.label).toBe("Hipertensão estágio 1");
    expect(classificarPressao(165, 95)?.label).toBe("Hipertensão estágio 2");
    expect(classificarPressao(150, 105)?.label).toBe("Hipertensão estágio 2");
    expect(classificarPressao(185, 95)?.label).toBe("Hipertensão estágio 3");
    expect(classificarPressao(120, 112)?.label).toBe("Hipertensão estágio 3");
  });

  it("pressão baixa continua existindo, na escala certa", () => {
    expect(classificarPressao(85, 55)?.label).toBe("Pressão baixa");
  });

  it("sistólica e diastólica trocadas não recebem rótulo clínico", () => {
    expect(classificarPressao(80, 120)?.tom).toBe("invalido");
  });

  it("sem os dois valores não classifica", () => {
    expect(classificarPressao(120, null)).toBeNull();
    expect(classificarPressao(null, null)).toBeNull();
  });

  it("a unidade acompanha o valor na tela", () => {
    expect(formatarPA(120, 90)).toBe("120/90 mmHg");
    expect(formatarPA(null, null)).toBe("—");
  });
});

describe("glicemia — travas de digitação", () => {
  it("900 mg/dL não é gravado", () => {
    const v = validarAfericao({ ...base, glicemia_jejum: "900" });
    expect(v.erro).toContain("900");
    expect(v.erro).toContain("20 a 600");
  });

  it("valor alto porém possível pede confirmação em vez de travar", () => {
    const v = validarAfericao({ ...base, glicemia_jejum: "450" });
    expect(v.erro).toBeNull();
    expect(v.confirmar).toContain("450");
  });

  it("valor de rotina passa sem aviso", () => {
    const v = validarAfericao({ ...base, glicemia_jejum: "99" });
    expect(v.erro).toBeNull();
    expect(v.confirmar).toBeNull();
  });

  it("crise hipertensiva pede confirmação", () => {
    const v = validarAfericao({ ...base, pressao_sistolica: "190", pressao_diastolica: "115" });
    expect(v.erro).toBeNull();
    expect(v.confirmar).toContain("190/115");
  });
});

describe("glicemia — faixas da Diretriz SBD 2025", () => {
  it("jejum segue a tabela do rodapé da tela", () => {
    expect(classificarGlicemiaJejum(65)?.label).toBe("Hipoglicemia");
    expect(classificarGlicemiaJejum(92)?.label).toBe("Normal");
    expect(classificarGlicemiaJejum(100)?.label).toBe("Pré-diabetes");
    expect(classificarGlicemiaJejum(125)?.label).toBe("Pré-diabetes");
    expect(classificarGlicemiaJejum(126)?.label).toBe("Alterada (diabetes)");
    expect(classificarGlicemiaJejum(310)?.label).toBe("Crítica");
  });

  it("pós-prandial usa os cortes de 2 horas, não os de jejum", () => {
    expect(classificarGlicemiaPos(120)?.label).toBe("Normal");
    expect(classificarGlicemiaPos(160)?.label).toBe("Pré-diabetes");
    expect(classificarGlicemiaPos(210)?.label).toBe("Alterada (diabetes)");
    // 120 em jejum já é pré-diabetes; pós-prandial, é normal.
    expect(classificarGlicemiaJejum(120)?.label).toBe("Pré-diabetes");
  });

  it("valor implausível não recebe rótulo clínico", () => {
    expect(classificarGlicemiaJejum(900)?.tom).toBe("invalido");
  });
});

describe("IMC — classificação nutricional OMS/ABESO", () => {
  it("calcula com a altura em centímetros", () => {
    expect(calcularImc("90", "170")).toBe(31.14);
  });

  it("nomeia os graus da obesidade", () => {
    expect(classificarImc(17)?.label).toBe("Abaixo do peso");
    expect(classificarImc(22)?.label).toBe("Peso normal");
    expect(classificarImc(27)?.label).toBe("Sobrepeso");
    expect(classificarImc(31.14)?.label).toBe("Obesidade grau I");
    expect(classificarImc(36)?.label).toBe("Obesidade grau II");
    expect(classificarImc(41)?.label).toBe("Obesidade grau III");
  });
});

describe("validação geral da aferição", () => {
  it("exige ao menos uma medição", () => {
    expect(validarAfericao(base).erro).toContain("pelo menos uma medição");
  });

  it("exige a pressão completa", () => {
    expect(validarAfericao({ ...base, pressao_sistolica: "120" }).erro).toContain(
      "pressão completa",
    );
  });

  it("não aceita aferição no futuro", () => {
    const amanha = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
    expect(validarAfericao({ ...base, data_registro: amanha, peso: "70" }).erro).toContain(
      "futuro",
    );
  });

  it("barra peso impossível", () => {
    expect(validarAfericao({ ...base, peso: "900" }).erro).toContain("Peso");
  });
});
