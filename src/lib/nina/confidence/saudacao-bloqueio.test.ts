/**
 * REGRESSÃO DO CASO RELATADO (captura da tela de erros da Nina).
 *
 * Sintoma: "ola bom dia" → apresentação normal da Nina → bloqueio por regra
 * publicada → tentativa de correção recusada pelo provedor (HTTP 400) →
 * substituição pelo aviso de transferência humana, sem transferência alguma.
 *
 * Causas provadas e cobertas aqui:
 *  1. a proibição "Não acrescente 'Como posso ajudar?' quando ela já explicou
 *     o que precisa" era representada como proibição de PERGUNTA para todo
 *     turno (condição perdida + categoria lida da frase vizinha);
 *  2. o pedido de correção terminava em turno do modelo (instrução `system`
 *     depois do `assistant`), recusado pelo provedor;
 *  3. em homologação o aviso simulado era idêntico ao de transferência
 *     concluída.
 */
import { describe, it, expect } from "bun:test";
import { extrairRegrasPublicadas } from "./regras-publicadas";
import { normalizarMensagensParaProvedor } from "../adapters/gemini-adapter.server";

const TEXTO_APRESENTACAO = `APRESENTAÇÃO

Na primeira resposta de uma nova sessão, cumprimente e apresente-se brevemente usando a identidade configurada.

Se a pessoa já fez uma pergunta, apresente-se e responda à pergunta na mesma mensagem. Não acrescente “Como posso ajudar?” quando ela já explicou o que precisa.

Nas mensagens seguintes, continue o atendimento sem repetir a apresentação.`;

const TEXTO_V6 = `TESTE TEMPORÁRIO DE FONTE DO PROMPT — HOMOLOGAÇÃO

Somente quando a mensagem recebida do paciente for EXATAMENTE:

TESTE-ARQUITETURA-9381

responda EXATAMENTE:

ARQUITETURA_CONFIRMADA_9381

Não acrescente saudação, emoji, explicação, pergunta, despedida ou qualquer
outro texto nessa resposta específica.`;

const RESPOSTA_APRESENTACAO =
  "Olá! Sou a Nina, assistente virtual da Policlínica Menino Jesus. Como posso ajudar?";

describe("regras publicadas — proibição condicionada", () => {
  it("proibição condicionada não vira proibição de conteúdo para todo turno", () => {
    const { regras } = extrairRegrasPublicadas(TEXTO_APRESENTACAO, {
      escopo: "whatsapp",
      hash: "H",
    });
    const alvo = regras.find((r) => r.descricao.includes("Não acrescente"));
    expect(alvo).toBeDefined();
    expect(alvo!.verificacao).not.toBe("proibicao_de_conteudo");
    expect(alvo!.proibicoes).toEqual([]);
  });
});

describe("composição do pedido ao provedor", () => {
  it("instrução de correção depois do turno do modelo vira turno de quem pede", () => {
    const r = normalizarMensagensParaProvedor([
      { role: "system", content: "prompt" },
      { role: "user", content: "ola bom dia" },
      { role: "assistant", content: RESPOSTA_APRESENTACAO },
      { role: "system", content: "reescreva conforme a regra" },
    ]);
    expect(r.ajuste).toBe("system_final_convertido");
    expect(r.mensagens[r.mensagens.length - 1]).toEqual({
      role: "user",
      content: "reescreva conforme a regra",
    });
  });

  it("pedido que termina em turno do modelo é recusado antes da chamada", () => {
    const r = normalizarMensagensParaProvedor([
      { role: "user", content: "oi" },
      { role: "assistant", content: "olá" },
    ]);
    expect(r.ajuste).toBe("termina_em_assistant");
  });

  it("pedido normal não é alterado", () => {
    const msgs = [
      { role: "system", content: "prompt" },
      { role: "user", content: "oi" },
    ];
    const r = normalizarMensagensParaProvedor(msgs);
    expect(r.ajuste).toBe("nenhum");
    expect(r.mensagens).toBe(msgs);
  });
});
