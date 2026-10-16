import { describe, expect, it } from "bun:test";
import { portaisOcultos } from "@/lib/portais-visiveis";

const perfil = (...modulos: string[]) => new Set(modulos);

describe("portaisOcultos", () => {
  it("admin vê todos os portais", () => {
    expect(portaisOcultos(null, null, "admin")).toEqual([]);
  });

  it("caixa sem Coach, RH e OS ZAP fica só com a Clínica Médica", () => {
    const ocultos = portaisOcultos(perfil("caixa", "clientes"), new Set(), "caixa");
    expect(ocultos.sort()).toEqual(["coach", "gestao-pessoas", "os-zap"]);
  });

  it("recepção com Coach liberado vê o Coach, mas não o RH", () => {
    const ocultos = portaisOcultos(perfil("agenda", "coach"), new Set(), "recepcao");
    expect(ocultos).toContain("gestao-pessoas");
    expect(ocultos).not.toContain("coach");
  });

  it("Coach desligado na matriz esconde o cartão", () => {
    const ocultos = portaisOcultos(perfil("agenda"), perfil("coach"), "recepcao");
    expect(ocultos).toContain("coach");
  });

  it("qualquer tela de RH liberada mostra o portal Funcionários / RH", () => {
    expect(portaisOcultos(perfil("treinamentos"), new Set(), "gestor")).not.toContain(
      "gestao-pessoas",
    );
  });
});
