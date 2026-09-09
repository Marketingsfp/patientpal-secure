import { describe, it, expect } from "bun:test";
import { divergenciaIdentidade, identidadeConversa, tituloConversa } from "../rotulo-conversa";

describe("FASE 5 — divergência entre contato WhatsApp e cadastro vinculado", () => {
  it("1) nomes iguais: sem divergência", () => {
    expect(divergenciaIdentidade("Tuane Alves", "Tuane Alves")).toBe(false);
  });

  it("2) nome parcial/apelido do mesmo cadastro: sem divergência", () => {
    expect(divergenciaIdentidade("Tuane", "Tuane Alves da Silva")).toBe(false);
    expect(divergenciaIdentidade("TUANE ALVES", "tuane alves")).toBe(false);
    expect(divergenciaIdentidade("Jose Antonio", "José Antônio Souza")).toBe(false);
  });

  it("3) nomes claramente diferentes: sinaliza divergência", () => {
    expect(divergenciaIdentidade("Tuane", "APARECIDA DE SOUZA")).toBe(true);
  });

  it("4) sem paciente vinculado ou sem nome de contato: nunca sinaliza", () => {
    expect(divergenciaIdentidade("Tuane", null)).toBe(false);
    expect(divergenciaIdentidade(null, "Aparecida")).toBe(false);
  });

  it("5) título continua sendo o contato do WhatsApp mesmo com paciente vinculado", () => {
    const conversa = {
      whatsapp_profile_name: "Tuane",
      contato_nome: null,
      pacientes: { nome: "APARECIDA DE SOUZA" },
    } as never;
    expect(tituloConversa(conversa)).toBe("Tuane");
    const id = identidadeConversa(conversa);
    expect(id.contato.nome).toBe("Tuane");
    expect(id.paciente.nome).toBe("APARECIDA DE SOUZA");
    expect(id.divergente).toBe(true);
  });

  it("6) novo profile.name do WhatsApp passa a valer como título", () => {
    const antes = { whatsapp_profile_name: "Tuane", contato_nome: "Contato antigo" } as never;
    const depois = { whatsapp_profile_name: "Tuane A.", contato_nome: "Contato antigo" } as never;
    expect(tituloConversa(antes)).toBe("Tuane");
    expect(tituloConversa(depois)).toBe("Tuane A.");
  });
});
