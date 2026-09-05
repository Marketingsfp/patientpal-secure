import { describe, it, expect } from "bun:test";
import { estadoVazio } from "../fluxo-estado-normalizar";
import {
  pediuEncerramento,
  decidirEncerramento,
  mensagemFinalCompleta,
  garantirMensagemFinal,
  mensagemFinalPadrao,
} from "../encerramento-automatico";

const UNIDADE = "Policlínica Menino Jesus";

describe("encerramento automático — leitura da mensagem", () => {
  it("reconhece encerramento claro", () => {
    for (const m of [
      "Não, obrigado.",
      "Não",
      "Só isso",
      "Era só isso",
      "Não precisa",
      "Obrigado, é só",
      "Pode encerrar",
      "Tudo certo",
    ]) {
      expect(pediuEncerramento(m)).toBe(true);
    }
  });

  it("não encerra quando há nova solicitação", () => {
    expect(pediuEncerramento("Obrigado. E qual o endereço?")).toBe(false);
    expect(pediuEncerramento("Obrigado, mas queria saber outra coisa")).toBe(false);
    expect(pediuEncerramento("Não, quero remarcar")).toBe(false);
  });
});

describe("encerramento automático — decisão", () => {
  it("encerra com fluxo parado", () => {
    const d = decidirEncerramento({ mensagemPaciente: "Só isso", estado: estadoVazio() });
    expect(d.encerrar).toBe(true);
  });

  it("não encerra com operação em andamento", () => {
    const estado = { ...estadoVazio(), flow: { stage: "WAITING_FINAL_CONFIRMATION" as const } };
    expect(decidirEncerramento({ mensagemPaciente: "Só isso", estado }).encerrar).toBe(false);
  });

  it("não encerra com handoff ou tool pendente", () => {
    const base = { mensagemPaciente: "Não, obrigado", estado: estadoVazio() };
    expect(decidirEncerramento({ ...base, handoffPendente: true }).encerrar).toBe(false);
    expect(decidirEncerramento({ ...base, operacaoPendente: true }).encerrar).toBe(false);
  });
});

describe("encerramento automático — mensagem final", () => {
  it("padrão contém todos os itens obrigatórios", () => {
    expect(mensagemFinalCompleta(mensagemFinalPadrao(UNIDADE), UNIDADE)).toBe(true);
  });

  it("completa despedida incompleta", () => {
    const r = garantirMensagemFinal("Foi um prazer ajudar! 😊", UNIDADE);
    expect(mensagemFinalCompleta(r, UNIDADE)).toBe(true);
    expect(r).toContain("Foi um prazer ajudar!");
  });

  it("mantém a resposta quando já está completa", () => {
    const texto = mensagemFinalPadrao(UNIDADE);
    expect(garantirMensagemFinal(texto, UNIDADE)).toBe(texto);
  });
});
