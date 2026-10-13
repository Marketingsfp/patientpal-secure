import { describe, expect, it } from "bun:test";
import { corrigirApresentacaoRepetida } from "../resposta/apresentacao-ia";
import { contemApresentacaoPublicada } from "../saudacao-sessao";

describe("apresentação como IA: 'Me chamo Maria, sou a inteligência artificial'", () => {
  it("corrige o caso real da homologação", () => {
    const texto =
      "Olá, boa noite!\nEu sou a Maria, eu sou inteligência artificial da Policlínica Menino Jesus.\nComo posso ajudar você hoje?";
    expect(corrigirApresentacaoRepetida(texto)).toBe(
      "Olá, boa noite!\nMe chamo Maria, sou a inteligência artificial da Policlínica Menino Jesus.\nComo posso ajudar você hoje?",
    );
  });

  it("cobre variações de ligação, nome composto e minúsculas", () => {
    expect(
      corrigirApresentacaoRepetida(
        "Eu sou a Ana Paula e eu sou inteligência artificial da Clínica Exemplo.",
      ),
    ).toBe("Me chamo Ana Paula, sou a inteligência artificial da Clínica Exemplo.");
    expect(
      corrigirApresentacaoRepetida("Boa tarde! sou o Léo, sou inteligência artificial da clínica."),
    ).toBe("Boa tarde! me chamo Léo, sou a inteligência artificial da clínica.");
    expect(
      corrigirApresentacaoRepetida(
        "Eu sou a Sofia, eu sou uma inteligência artificial da Clínica Exemplo.",
      ),
    ).toBe("Me chamo Sofia, sou a inteligência artificial da Clínica Exemplo.");
  });

  it("a forma antiga, sem o artigo, ganha o 'a' antes de inteligência artificial", () => {
    expect(
      corrigirApresentacaoRepetida(
        "Boa tarde! Me chamo Maria e eu sou inteligência artificial da Policlínica Menino Jesus.",
      ),
    ).toBe("Boa tarde! Me chamo Maria, sou a inteligência artificial da Policlínica Menino Jesus.");
    expect(corrigirApresentacaoRepetida("Eu sou inteligência artificial deste atendimento.")).toBe(
      "Eu sou a inteligência artificial deste atendimento.",
    );
  });

  it("não altera a apresentação já correta nem textos sem repetição", () => {
    for (const texto of [
      "Boa noite! Me chamo Maria, sou a inteligência artificial da Policlínica Menino Jesus.",
      "Eu sou a inteligência artificial deste atendimento.",
      "Eu sou a Maria. Como posso ajudar?",
      "",
    ]) {
      expect(corrigirApresentacaoRepetida(texto)).toBe(texto);
    }
  });

  it("o texto corrigido continua reconhecido como apresentação publicada", () => {
    const corrigido = corrigirApresentacaoRepetida(
      "Boa noite! Eu sou a Maria, eu sou inteligência artificial da Clínica Exemplo. Como posso ajudar?",
    );
    expect(
      contemApresentacaoPublicada(corrigido, {
        assistente: "Maria",
        estabelecimento: "Clínica Exemplo",
      }),
    ).toBe(true);
  });
});
