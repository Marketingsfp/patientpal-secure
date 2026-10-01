import { describe, expect, it } from "bun:test";
import { removerEmojis, removerEmojisNina } from "../resposta/sem-emojis";
import { PROMPT_NINA_WHATSAPP_V4 } from "../prompt/behavior-v4";
import { montarMensagemHandoffFallback } from "@/lib/atendimento/mensagem-handoff";

describe("Nina: emojis permitidos com moderação", () => {
  it("a regra do prompt permite emojis", () => {
    expect(PROMPT_NINA_WHATSAPP_V4).toContain("INSTRUÇÃO LING-03 — EMOJIS COM MODERAÇÃO");
  });
  it("a finalização preserva emojis da Nina", () => {
    const t = "Boa tarde! 😊\n\nPix/cartão: R$ 145,00";
    expect(removerEmojisNina(t)).toBe(t);
  });
  it("removerEmojis limpa dados sem juntar palavras", () => {
    expect(removerEmojis("Olá😊Maria!")).toBe("Olá Maria!");
    const semEmoji = "*Dr. João* - 13:30; R$ 145,00; #1; 2 * 3";
    expect(removerEmojis(semEmoji)).toBe(semEmoji);
  });
  it("nome do paciente com emoji não vai para o aviso de transferência", () => {
    const texto = montarMensagemHandoffFallback({ protocolo: "MJ-100", motivo: "agendamento", nome: "Maria😊" });
    expect(texto).toContain("Maria,");
    expect(texto).not.toContain("😊");
  });
});
