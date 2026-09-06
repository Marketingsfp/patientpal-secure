import { describe, expect, it } from "bun:test";
import {
  avisoVigente,
  formatarBRL,
  formatarDataBR,
  normalizarHora,
  paraNumero,
  profissionalSchema,
  resumoHorarios,
  servicoSchema,
  valorResumo,
} from "../catalogo";

describe("Catálogo da Nina — formatos", () => {
  it("interpreta valores em formato brasileiro e vazio como não informado", () => {
    expect(paraNumero("R$ 1.234,56")).toBe(1234.56);
    expect(paraNumero("130.00")).toBe(130);
    expect(paraNumero("")).toBeNull();
    expect(paraNumero(null)).toBeNull();
  });

  it("normaliza horários para HH:mm em 24 horas", () => {
    expect(normalizarHora("8")).toBe("08:00");
    expect(normalizarHora("8:30")).toBe("08:30");
    expect(normalizarHora("25:00")).toBeNull();
    expect(normalizarHora("")).toBeNull();
  });

  it("formata data em DD/MM/AAAA e valor em R$", () => {
    expect(formatarDataBR("2026-09-06")).toBe("06/09/2026");
    expect(formatarDataBR(null)).toBe("—");
    expect(formatarBRL(null)).toBe("—");
    expect(formatarBRL(130)).toContain("130,00");
  });
});

describe("Catálogo da Nina — exames e procedimentos", () => {
  it("ausência de valor não vira preço zero", () => {
    const s = servicoSchema.parse({ nome: "Ultrassom", valor: "" });
    expect(s.valor).toBeNull();
    expect(s.nota_interna).toBeNull();
  });

  it("resumo de preço vem das formas de pagamento quando existem", () => {
    expect(
      valorResumo({ valor: 999, formas_pagamento: [{ valor: 130 }, { valor: 150 }] }),
    ).toBe(130);
    expect(valorResumo({ valor: 200, formas_pagamento: [] })).toBe(200);
    expect(valorResumo({ valor: null, formas_pagamento: [{ valor: null }] })).toBeNull();
  });

  it("recusa procedimento sem nome", () => {
    expect(() => servicoSchema.parse({ nome: " " })).toThrow();
  });
});

describe("Catálogo da Nina — consultas e profissionais", () => {
  it("preserva recorrência quinzenal e não fecha dias por ausência", () => {
    const p = profissionalSchema.parse({
      nome: "Dra. Ana",
      horarios: [{ dia: "Quinta-feira", inicio: "14", fim: "18:00", recorrencia: "Quinzenal" }],
    });
    expect(p.horarios[0]?.inicio).toBe("14:00");
    expect(p.horarios[0]?.recorrencia).toBe("Quinzenal");
    expect(p.atende_consultorio).toBeNull();
    expect(resumoHorarios([])).toBe("Horários não informados");
  });

  it("recusa término anterior ao início", () => {
    expect(() =>
      profissionalSchema.parse({
        nome: "Dr. João",
        horarios: [{ dia: "Segunda-feira", inicio: "12:00", fim: "08:00" }],
      }),
    ).toThrow();
  });

  it("aviso do dia vale apenas dentro do período informado", () => {
    const aviso = { aviso_dia: "Hoje começa às 10h", aviso_valido_de: "2026-09-01", aviso_valido_ate: "2026-09-02" };
    expect(avisoVigente(aviso, "2026-09-01")).toBe(true);
    expect(avisoVigente(aviso, "2026-09-05")).toBe(false);
    expect(avisoVigente({ aviso_dia: null }, "2026-09-01")).toBe(false);
  });
});
