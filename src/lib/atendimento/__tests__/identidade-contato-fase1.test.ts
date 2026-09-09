import { describe, expect, it } from "bun:test";
import { identidadeConversa, nomeContato, tituloConversa } from "../rotulo-conversa";

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
    expect(id.contato).toEqual({ nome: "Tuane", telefone: "5521971589468", fonte: "contato_legacy" });
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

/** FASE 2 — o perfil do WhatsApp é a fonte canônica do nome principal. */
describe("FASE 2 — nome principal vem do perfil do WhatsApp", () => {
  it("TESTE 1 — perfil Tuane com paciente Aparecida vinculado", () => {
    expect(
      tituloConversa({
        whatsapp_profile_name: "Tuane",
        contato_nome: "Tuane",
        contato_telefone: "5521971589468",
        pacientes: { nome: "Aparecida de Souza" },
      }),
    ).toBe("Tuane");
  });

  it("TESTE 2 — perfil Tuane sem paciente vinculado", () => {
    const id = identidadeConversa({
      whatsapp_profile_name: "Tuane",
      contato_telefone: "5521971589468",
      pacientes: null,
    });
    expect(id.principal).toBe("Tuane");
    expect(id.contato.fonte).toBe("perfil_whatsapp");
    expect(id.paciente.vinculado).toBe(false);
  });

  it("TESTE 3 — conversa antiga sem perfil usa o contato legado", () => {
    const id = identidadeConversa({ contato_nome: "João", contato_telefone: "5588999990000" });
    expect(id.principal).toBe("João");
    expect(id.contato.fonte).toBe("contato_legacy");
  });

  it("TESTE 4 — sem nenhum nome válido", () => {
    expect(
      tituloConversa({
        whatsapp_profile_name: "5521971589468",
        contato_nome: "+5521971589468",
        contato_telefone: "5521971589468",
      }),
    ).toBe("Paciente não identificado");
  });

  it("TESTE 5 — cabeçalho e handoff usam a mesma identidade", () => {
    const conversa = {
      whatsapp_profile_name: "Tuane",
      contato_nome: "Aparecida",
      contato_telefone: "5521971589468",
      pacientes: { nome: "Aparecida de Souza" },
    };
    // gerarProtocoloEMensagem usa nomeContato(conv) para saudar o paciente.
    expect(nomeContato(conversa)).toBe(tituloConversa(conversa));
    expect(nomeContato(conversa)).toBe("Tuane");
  });
});
