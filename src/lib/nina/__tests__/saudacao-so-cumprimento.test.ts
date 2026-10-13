import { describe, expect, it } from "bun:test";
import { respostaSoSaudacao } from "../identidade-efetiva";
import { ehSaudacaoPura } from "../confidence/turno-tipo";
import { contemApresentacaoPublicada } from "../saudacao-sessao";

const IDENTIDADE = {
  assistente: "Maria",
  estabelecimento: "Menino Jesus",
  tipoEstabelecimento: "Policlínica",
};
const MANHA = new Date("2026-10-13T12:00:00Z"); // 09:00 em Brasília

describe("paciente só cumprimenta: resposta no modelo", () => {
  it("primeira resposta: saudação, apresentação e pergunta de abertura (sem emoji)", () => {
    expect(respostaSoSaudacao(IDENTIDADE, true, MANHA)).toBe(
      "Bom dia! Me chamo Maria, sou a inteligência artificial da Policlínica Menino Jesus.\nComo posso ajudar? Informações sobre consultas, especialidades, exames ou algum outro assunto?",
    );
    // Continua reconhecida como a apresentação publicada da sessão.
    expect(
      contemApresentacaoPublicada(respostaSoSaudacao(IDENTIDADE, true, MANHA), {
        assistente: "Maria",
        estabelecimento: "Menino Jesus",
      }),
    ).toBe(true);
  });

  it("apresentação já feita na sessão: só saudação e pergunta de abertura", () => {
    expect(respostaSoSaudacao(IDENTIDADE, false, MANHA)).toBe(
      "Bom dia!\nComo posso ajudar? Informações sobre consultas, especialidades, exames ou algum outro assunto?",
    );
  });

  it("reconhece só cumprimentos, não pedidos", () => {
    for (const t of ["Bom dia!", "oi boa tarde", "Olá", "oi, tudo bem?"])
      expect(ehSaudacaoPura(t)).toBe(true);
    expect(ehSaudacaoPura("Bom dia, vocês têm ginecologista?")).toBe(false);
  });
});
