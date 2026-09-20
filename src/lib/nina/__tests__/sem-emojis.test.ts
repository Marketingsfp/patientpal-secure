import { describe, expect, it } from "bun:test";
import { removerEmojisNina } from "../resposta/sem-emojis";
import { criarResultado } from "../resposta/contrato";
import { finalizarResposta, limparFinalizacoes } from "../resposta/finalizacao.server";
import { hashDoTexto } from "../confidence/hash";
import {
  textoDaChave,
  acrescentarDespedidaAgendamento,
  TEMPLATES_PADRAO,
} from "../resposta/templates";
import { PROMPT_NINA_WHATSAPP_V4 } from "../prompt/behavior-v4";
import {
  montarMensagemHandoffFallback,
  promptMensagemHandoff,
} from "@/lib/atendimento/mensagem-handoff";

describe("Nina: emojis proibidos em toda saída", () => {
  it("padrões e exemplos de fallback não incentivam emojis", () => {
    for (const template of TEMPLATES_PADRAO) {
      expect(template.padrao).toBe(removerEmojisNina(template.padrao));
    }
    expect(PROMPT_NINA_WHATSAPP_V4).toBe(removerEmojisNina(PROMPT_NINA_WHATSAPP_V4));
    expect(PROMPT_NINA_WHATSAPP_V4).toContain("INSTRUÇÃO LING-03 — EMOJIS PROIBIDOS");
  });
  it.each(["😊", "💚", "👩🏽‍⚕️", "👨‍👩‍👧‍👦", "🇧🇷", "🏳️‍🌈", "↔️", "☀", "✈️", "🏴\u{E0067}\u{E0062}\u{E007F}"])(
    "remove a sequência completa %s sem juntar palavras",
    (emoji) => expect(removerEmojisNina(`Olá${emoji}Maria!`)).toBe("Olá Maria!"),
  );

  it("preserva informações e formatação; keycaps viram números comuns", () => {
    expect(
      removerEmojisNina(
        "📅 *Dr. João*\n1️⃣ Terça-feira, 22/09 às 13:30\n\n💰 Dinheiro: R$ 120,00\n💳 Pix/cartão: R$ 145,00\n✅ A partir de 18 anos",
      ),
    ).toBe(
      "*Dr. João*\n1 Terça-feira, 22/09 às 13:30\n\nDinheiro: R$ 120,00\nPix/cartão: R$ 145,00\nA partir de 18 anos",
    );
    const semEmoji = "*Dr. João*\n\n  - 13:30; R$ 145,00; 18 anos; #1; 2 * 3; 37°C; +55";
    expect(removerEmojisNina(semEmoji)).toBe(semEmoji);
  });

  it("é idempotente e não transforma um emoji isolado em mensagem vazia enviada", async () => {
    const limpo = removerEmojisNina("😊 Olá! 💚");
    expect(removerEmojisNina(limpo)).toBe(limpo);
    limparFinalizacoes();
    const r = await finalizarResposta({
      clinicaId: "emoji-test",
      canal: "test-console",
      chaveTurno: "emoji-isolado",
      resultado: criarResultado({ origem: "modelo", texto: "😊 💚" }),
    });
    expect(r.texto).toBe("");
    expect(r.resultado.estado).toBe("descartar");
  });

  it.each(["whatsapp", "test-console"] as const)(
    "finaliza antes do hash em %s e preserva o original na auditoria",
    async (canal) => {
      limparFinalizacoes();
      const texto = "Boa tarde! 😊\n\nPix/cartão: R$ 145,00";
      const pedido = {
        clinicaId: "emoji-test",
        canal,
        chaveTurno: `emoji-${canal}`,
        resultado: criarResultado({ origem: "modelo", texto }),
      };
      const r = await finalizarResposta(pedido);
      expect(r.texto).toBe("Boa tarde!\n\nPix/cartão: R$ 145,00");
      expect(r.resultado.texto).toBe(r.texto);
      expect(r.textoHash).toBe(hashDoTexto(r.texto));
      expect(r.textoOriginal).toBe(texto);
      expect(r.textoOriginalHash).not.toBe(r.textoHash);
      expect((await finalizarResposta(pedido)).texto).toBe(r.texto);
    },
  );

  it("abrange mensagens automáticas e variáveis com emojis", async () => {
    limparFinalizacoes();
    const r = await finalizarResposta({
      clinicaId: "emoji-test",
      canal: "whatsapp",
      chaveTurno: "emoji-template",
      resultado: criarResultado({
        origem: "encerramento",
        texto: "",
        chaveTemplate: "encerramento.despedida",
        variaveis: { unidade: "Clínica 💚" },
      }),
    });
    expect(r.texto).toContain("Clínica");
    expect(r.texto).toBe(removerEmojisNina(r.texto));
    for (const motivo of [
      "agendamento",
      "financeiro",
      "informacao_indisponivel",
      "pedido_do_paciente",
      "indefinido",
    ] as const) {
      const texto = montarMensagemHandoffFallback({
        protocolo: "MJ-100",
        motivo,
        nome: "Maria😊",
        assunto: "pagamento💳",
      });
      expect(texto).toBe(removerEmojisNina(texto));
      expect(texto).toContain("MJ-100");
    }
    expect(promptMensagemHandoff({ protocolo: "MJ-100" })).toContain("emojis são proibidos");
  });

  it("limpa templates publicados antigos e não duplica a despedida ao reaplicar", () => {
    const publicados = {
      "encerramento.despedida": "Até breve! 💚 A {unidade} agradece.",
      "fluxo.agendamento.despedida": "A {unidade} agradece! 😊",
    };
    expect(textoDaChave("encerramento.despedida", { unidade: "Clínica💚" }, publicados).texto).toBe(
      "Até breve! A Clínica agradece.",
    );
    const r = acrescentarDespedidaAgendamento("Confirmado! ✅", "Clínica", publicados);
    expect(r.texto).toBe("Confirmado!\n\nA Clínica agradece!");
    expect(acrescentarDespedidaAgendamento(r.texto, "Clínica", publicados).texto).toBe(r.texto);
  });
});
