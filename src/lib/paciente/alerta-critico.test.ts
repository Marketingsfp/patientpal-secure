import { describe, expect, it } from "bun:test";
import { limparMotivoAlerta, podeMarcarAlertaCritico } from "./alerta-critico";

/** Pessoa com a permissão individual concedida pela diretoria. */
const marcado = true;

describe("alçada do alerta crítico do paciente", () => {
  it("a supervisão autorizada marca o alerta", () => {
    expect(podeMarcarAlertaCritico("admin", marcado)).toBe(true);
    expect(podeMarcarAlertaCritico("gestor", marcado)).toBe(true);
    expect(podeMarcarAlertaCritico("supervisor", marcado)).toBe(true);
  });

  it("perfil de administrador sem a marcação individual não basta", () => {
    // É o caso da maioria da equipe desta clínica: quase todo mundo tem
    // perfil de administrador porque é ele que abre as telas do dia a dia.
    expect(podeMarcarAlertaCritico("admin", false)).toBe(false);
    expect(podeMarcarAlertaCritico("admin", null)).toBe(false);
  });

  it("balcão, caixa, financeiro e médico não mexem no alerta", () => {
    expect(podeMarcarAlertaCritico("recepcao", marcado)).toBe(false);
    expect(podeMarcarAlertaCritico("caixa", marcado)).toBe(false);
    expect(podeMarcarAlertaCritico("financeiro", marcado)).toBe(false);
    expect(podeMarcarAlertaCritico("medico", marcado)).toBe(false);
    expect(podeMarcarAlertaCritico(null, marcado)).toBe(false);
  });
});

describe("motivo do alerta", () => {
  it("motivo só de espaço vira nulo — tarja vermelha muda sem explicação", () => {
    expect(limparMotivoAlerta("   ")).toBeNull();
    expect(limparMotivoAlerta("")).toBeNull();
    expect(limparMotivoAlerta(null)).toBeNull();
  });

  it("junta espaços e quebras de linha coladas do texto original", () => {
    expect(limparMotivoAlerta("  Processo judicial\n  ativo  ")).toBe("Processo judicial ativo");
  });

  it("corta no limite gravado no banco", () => {
    expect(limparMotivoAlerta("a".repeat(900))?.length).toBe(500);
  });
});
