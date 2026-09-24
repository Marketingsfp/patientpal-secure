import { describe, expect, test } from "bun:test";
import { ehRespostaAfirmativaCurta, ehRespostaNegativaCurta } from "../resposta-afirmativa";
import { ehConfirmacaoDeAgendamento } from "../confirmacao-agendamento";
import { ehNegacao } from "../identificacao-gate.server";
import { PROMPT_NINA_WHATSAPP_V4 } from "../prompt/behavior-v4";
import { validarTemplateInstrucoes } from "../instrucoes-template";

describe("concordância e recusa informais brasileiras", () => {
  test("instruções completas cabem na publicação com identidade e marcadores válidos", () => {
    const identidade = "[IDENTIDADE DO ATENDIMENTO]\nNome da atendente virtual: Nina\nNome do estabelecimento: Policlínica Menino Jesus\nTipo do estabelecimento: Policlínica\n[/IDENTIDADE DO ATENDIMENTO]\n\n";
    const conteudo = identidade + PROMPT_NINA_WHATSAPP_V4;
    expect(conteudo.length).toBeLessThanOrEqual(60000);
    expect(validarTemplateInstrucoes("whatsapp", conteudo).ok).toBe(true);
  });
  test.each(["já é!", "formou", "demorou", "combinado", "tá ok", "bora sim",
    "Fechou, por favor!", "simmm", "ss", "esse msm", "blz", "uhum"])("concordância da opção pendente: %s", texto => {
    expect(ehRespostaAfirmativaCurta(texto)).toBe(true);
    expect(ehConfirmacaoDeAgendamento(texto)).toBe(true);
    expect(ehNegacao(texto)).toBe(false);
  });
  test.each(["não", "nao", "n", "nn", "nããão!", "não, não", "negativo",
    "esse não", "esse msm nn", "quero não", "não quero não", "posso não",
    "não vou não", "confirmo não", "não confirmo", "nn confirmo", "não vai rolar",
    "vai rolar não", "não dá não", "dá não", "nem pensar", "de jeito nenhum",
    "melhor não", "agora não", "ainda não", "deixa pra lá", "não, obrigado"])("recusa nunca vira confirmação: %s", texto => {
    expect(ehRespostaNegativaCurta(texto)).toBe(true);
    expect(ehNegacao(texto)).toBe(true);
    expect(ehRespostaAfirmativaCurta(texto)).toBe(false);
    expect(ehConfirmacaoDeAgendamento(texto)).toBe(false);
  });
  test.each(["valeu", "vlw", "show", "pode crer", "pdc", "papo reto", "ainda",
    "vou ver", "acho que sim", "sei lá", "demorou muito", "formou?", "já é?",
    "sim, mas outro horário", "formou, só se for amanhã", "blz, vou pensar",
    "já é, não", "demorou, nn", "bora, se tiver desconto", "não tenho CPF",
    "não precisa mudar, confirmo esse horário", "dá", "rola", "vai rolar"])("não decide uma operação a partir de frase ambígua ou outro assunto: %s", texto => {
    expect(ehRespostaAfirmativaCurta(texto)).toBe(false);
    expect(ehConfirmacaoDeAgendamento(texto)).toBe(false);
    expect(ehRespostaNegativaCurta(texto)).toBe(false);
  });
});
