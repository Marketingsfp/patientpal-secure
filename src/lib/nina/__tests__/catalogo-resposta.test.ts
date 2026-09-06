/**
 * FASE 4 — forma da resposta, incertezas e continuidade.
 *
 * Verifica que a definição central (blocoPromptCatalogo) orienta:
 * responder o que foi perguntado, não repetir saudação, não pedir dado
 * pessoal para dúvida simples, não transformar campo vazio em negativa,
 * não escolher entre registros conflitantes e não confirmar operação
 * antes da execução real.
 */
import { describe, expect, it, mock } from "bun:test";

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ count: 5 }),
        }),
      }),
    }),
  },
}));

const { blocoPromptCatalogo } = await import("../catalogo-prompt.server");

const bloco = await blocoPromptCatalogo("clinica-teste");

describe("FASE 4 — resposta ao paciente", () => {
  it("orienta começar pela informação pedida e padronizar valores/datas", () => {
    expect(bloco).toContain("Comece pela informação pedida");
    expect(bloco).toContain("R$ 0,00");
  });

  it("proíbe expor JSON, IDs e nomes de campos", () => {
    expect(bloco).toMatch(/NUNCA mostre JSON/);
  });

  it("evita repetir saudação e convite em toda mensagem", () => {
    expect(bloco).toContain("não em toda mensagem");
  });

  it("trata várias perguntas separando confirmado de pendente", () => {
    expect(bloco).toMatch(/Várias perguntas/);
  });
});

describe("FASE 4 — contexto sem obstáculo", () => {
  it("não repergunta o que já foi informado", () => {
    expect(bloco).toContain("Não pergunte de novo");
  });

  it("dúvida administrativa simples não exige CPF", () => {
    expect(bloco).toMatch(/Dúvida administrativa simples.*NÃO exige nome completo, CPF/s);
  });
});

describe("FASE 4 — ausência de informação", () => {
  it("campo vazio não vira gratuidade, dia fechado ou convênio recusado", () => {
    expect(bloco).toContain("é gratuito");
    expect(bloco).toContain("não atende nesse dia");
    expect(bloco).toContain("não aceita convênio");
  });

  it("não pede ao paciente o preço que falta no cadastro", () => {
    expect(bloco).toMatch(/informação que é da clínica/);
  });
});

describe("FASE 4 — contradição e execução", () => {
  it("não escolhe em silêncio entre registros conflitantes", () => {
    expect(bloco).toContain("não escolha uma em silêncio");
  });

  it("catálogo vigente prevalece sobre resposta anterior da conversa", () => {
    expect(bloco).toMatch(/resposta anterior desta conversa não vale mais/);
  });

  it("não confirma vaga pelo horário habitual nem anuncia agendamento antes da operação", () => {
    expect(bloco).toContain("NUNCA confirme vaga");
    expect(bloco).toMatch(/antes de a operação retornar confirmada/);
  });
});
