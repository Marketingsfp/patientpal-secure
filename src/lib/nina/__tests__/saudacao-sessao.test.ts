import { describe, expect, it } from "bun:test";
import { estadoVazio, normalizarEstado } from "../fluxo-estado-normalizar";
import { novaSessao, reabrirSessao } from "../sessao";
import {
  aplicarSaudacaoObrigatoria,
  checarElementosSaudacao,
  garantirSessaoAtiva,
  marcarSaudacaoConcluida,
  saudacaoCompleta,
  debugSessaoNina,
} from "../saudacao-sessao";

const UNIDADE = "Policlínica Menino Jesus";

describe("Saudação obrigatória por sessão da Nina", () => {
  it("Teste 1 — conversa nova exige apresentação e cria session_id", () => {
    const r = garantirSessaoAtiva(estadoVazio());
    expect(r.novaSessao).toBe(true);
    expect(r.saudacaoObrigatoria).toBe(true);
    expect(r.estado.session_id).toBeTruthy();
  });

  it("Teste 2 — segunda mensagem da mesma sessão não repete apresentação", () => {
    const inicial = garantirSessaoAtiva(estadoVazio()).estado;
    const depois = marcarSaudacaoConcluida(inicial);
    const r = garantirSessaoAtiva(depois);
    expect(r.saudacaoObrigatoria).toBe(false);
    expect(r.estado.session_id).toBe(inicial.session_id!);
  });

  it("Teste 3/5/6 — conversa resolvida + nova mensagem = nova sessão e saudação pendente", () => {
    const antiga = marcarSaudacaoConcluida(garantirSessaoAtiva(estadoVazio()).estado);
    const nova = reabrirSessao(antiga);
    expect(nova.session_id).not.toBe(antiga.session_id);
    expect(nova.greeting_completed).toBe(false);
    expect(garantirSessaoAtiva(nova).saudacaoObrigatoria).toBe(true);
  });

  it("Teste 4 — contexto anterior não dispensa a apresentação", () => {
    const antiga = marcarSaudacaoConcluida({
      ...garantirSessaoAtiva(estadoVazio()).estado,
      patient: {
        ...estadoVazio().patient,
        id: "p1",
        first_name: "Jean",
        identified: true,
        validated: true,
      },
      appointment: { ...estadoVazio().appointment, specialty: "Ginecologia" },
    });
    const nova = reabrirSessao(antiga);
    expect(nova.patient.first_name).toBe("Jean");
    expect(garantirSessaoAtiva(nova).saudacaoObrigatoria).toBe(true);
  });

  it("expiração por TTL também zera a flag de saudação", () => {
    const antiga = marcarSaudacaoConcluida(garantirSessaoAtiva(estadoVazio()).estado);
    expect(novaSessao(antiga).greeting_completed).toBe(false);
  });

  it("estado legado sem session_id, com resposta na janela, não força apresentação", () => {
    const r = garantirSessaoAtiva(estadoVazio(), { jaRespondeuNestaSessao: true });
    expect(r.saudacaoObrigatoria).toBe(false);
    expect(r.estado.greeting_completed).toBe(true);
  });

  it("normalização preserva a flag gravada", () => {
    expect(normalizarEstado({ greeting_completed: true }).greeting_completed).toBe(true);
    expect(normalizarEstado({}).greeting_completed).toBe(false);
  });
});

describe("Validação semântica da apresentação", () => {
  it("aceita variações de texto com todos os elementos", () => {
    const a = "Olá, boa tarde! 😊 Sou a Nina, assistente virtual da Policlínica Menino Jesus. Como posso te ajudar?";
    const b = "Boa tarde! Sou a Nina, assistente virtual da Policlinica Menino Jesus. Em que posso te ajudar hoje?";
    expect(saudacaoCompleta(a, UNIDADE)).toBe(true);
    expect(saudacaoCompleta(b, UNIDADE)).toBe(true);
  });

  it("recusa resposta sem apresentação", () => {
    const e = checarElementosSaudacao("Boa tarde, Jean! Como posso ajudar você hoje?", UNIDADE);
    expect(e.saudacao).toBe(true);
    expect(e.nina).toBe(false);
    expect(e.assistenteVirtual).toBe(false);
    expect(saudacaoCompleta("Boa tarde, Jean! Como posso ajudar você hoje?", UNIDADE)).toBe(false);
  });

  it("corrige a resposta do modelo quando falta a apresentação", () => {
    const corrigida = aplicarSaudacaoObrigatoria(
      "Boa tarde, Jean! Como posso ajudar você hoje?",
      UNIDADE,
    );
    expect(saudacaoCompleta(corrigida, UNIDADE)).toBe(true);
    expect(corrigida).toContain("assistente virtual");
    expect(corrigida).toContain("Menino Jesus");
  });

  it("não altera uma resposta que já cumpre a regra", () => {
    const ok = "Olá, bom dia! Sou a Nina, assistente virtual da Policlínica Menino Jesus. Como posso te ajudar?";
    expect(aplicarSaudacaoObrigatoria(ok, UNIDADE)).toBe(ok);
  });

  it("mantém o conteúdo da resposta ao prefixar a apresentação", () => {
    const corrigida = aplicarSaudacaoObrigatoria(
      "A consulta de Cardiologia custa R$ 150,00.",
      UNIDADE,
    );
    expect(corrigida).toContain("R$ 150,00");
    expect(corrigida).toContain("Sou a Nina");
  });

  it("debug de QA expõe os campos de sessão", () => {
    const r = garantirSessaoAtiva(estadoVazio());
    const d = debugSessaoNina(r.estado, r);
    expect(d.greeting_required).toBe(true);
    expect(d.greeting_completed).toBe(false);
    expect(d.nina_session_id).toBeTruthy();
    expect(d.conversation_state).toBe("IDLE");
  });
});
