import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { termoBuscaPaciente } from "../chat-agenda.functions";

describe("busca de paciente na conversa", () => {
  test("tira caracteres que mudariam o filtro do banco", () => {
    expect(termoBuscaPaciente("Maria,clinica_id.neq.x")).toBe("Maria clinica_id.neq.x");
    expect(termoBuscaPaciente('Ana (teste) "100%" *')).toBe("Ana teste 100");
    expect(termoBuscaPaciente("José da Silva")).toBe("José da Silva");
    expect(termoBuscaPaciente("123.456.789-00")).toBe("123.456.789-00");
  });
});

describe("agenda dentro da conversa (16/10/2026)", () => {
  const funcoes = readFileSync("src/lib/agenda/chat-agenda.functions.ts", "utf8");
  const painel = readFileSync("src/components/nina/AgendaConversaDrawer.tsx", "utf8");
  const inbox = readFileSync("src/components/nina/AtendimentoExtraTabs.tsx", "utf8");

  test("toda função confere se a pessoa é da clínica", () => {
    const handlers = funcoes.split(".handler(").length - 1;
    const checagens = funcoes.split("await exigirMembro(").length - 1;
    expect(handlers).toBeGreaterThan(0);
    expect(checagens).toBe(handlers);
  });

  test("ordem de chegada não oferece horário", () => {
    expect(painel).toContain("s.livre && !s.ordem_chegada");
  });

  test("inbox só agenda com paciente vinculado e fora de conversa de teste", () => {
    expect(inbox).toContain("<AgendaConversaDrawer");
    expect(inbox).toContain("Vincule o paciente antes de agendar.");
    expect(inbox).toContain("!sel.is_teste");
  });
});
