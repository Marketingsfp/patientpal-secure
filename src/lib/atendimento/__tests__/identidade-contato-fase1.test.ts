import { describe, expect, it } from "bun:test";
import { identidadeConversa, tituloConversa } from "../rotulo-conversa";

/**
 * Caso real: número +55 21 97158-9468 usado hoje pela TUANE, mas com um
 * cadastro antigo de APARECIDA DE SOUZA ainda vinculado à conversa.
 * O cabeçalho deve mostrar a identidade do contato WhatsApp; o cadastro
 * continua disponível em separado, sem ser alterado nem desvinculado aqui.
 */
describe("FASE 1 — identidade do contato x paciente cadastrado", () => {
  const conversa = {
    contato_nome: "Tuane",
    contato_telefone: "5521971589468",
    pacientes: { nome: "Aparecida de Souza" },
  };

  it("o título da conversa é o nome do contato WhatsApp", () => {
    expect(tituloConversa(conversa)).toBe("Tuane");
  });

  it("o paciente vinculado continua disponível separadamente", () => {
    const id = identidadeConversa(conversa);
    expect(id.contato).toEqual({ nome: "Tuane", telefone: "5521971589468" });
    expect(id.paciente).toEqual({ nome: "Aparecida de Souza", vinculado: true });
    expect(id.origem).toBe("contato_whatsapp");
    expect(id.divergente).toBe(true);
  });

  it("cabeçalho e mensagem de handoff passam a usar a mesma fonte", () => {
    expect(tituloConversa(conversa)).toBe(conversa.contato_nome);
  });

  it("sem nome de contato, cai no paciente vinculado sem divergência", () => {
    const id = identidadeConversa({ ...conversa, contato_nome: null });
    expect(id.principal).toBe("Aparecida de Souza");
    expect(id.origem).toBe("paciente_vinculado");
    expect(id.divergente).toBe(false);
  });

  it("telefone no campo de nome não vira identidade de contato", () => {
    const id = identidadeConversa({ ...conversa, contato_nome: "5521971589468" });
    expect(id.contato.nome).toBe(null);
    expect(id.principal).toBe("Aparecida de Souza");
  });
});
