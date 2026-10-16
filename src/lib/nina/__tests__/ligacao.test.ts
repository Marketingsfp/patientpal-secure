import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  REGRAS_WHATSAPP_FORA_DA_LIGACAO,
  ferramentasDaLigacao,
  instrucoesDaLigacao,
} from "../ligacao/contrato-ligacao.server";
import { resultadoSimulado } from "../ligacao/ferramentas-ligacao.server";
import {
  codigoDoErro,
  corpoInicioSessao,
  juntarFala,
  LIMITE_PASSOS_LIGACAO,
  MODELO_APOIO_LIGACAO,
  MODELOS_APOIO_LIGACAO,
  MODELO_VOZ_LIGACAO,
  semTurnoFinalDoAssistente,
} from "../ligacao/sessao-live.server";
import { LIMITE_RODADAS_COMUM } from "../eficiencia-turno";
import {
  ESTADO_INICIAL_LIGACAO,
  ROTULOS_FERRAMENTAS,
  aplicarEventoLigacao,
  chamadaDoEvento,
  eventosResultadoFerramenta,
} from "../ligacao/eventos-ligacao";
import { FERRAMENTAS_SIMULADAS_LIGACAO } from "../ligacao/config";
import { instrucoesCamadaVoz } from "../ligacao/regras-ligacao";

const codigos = (o: Parameters<typeof instrucoesDaLigacao>[0]) =>
  instrucoesDaLigacao(o).map((r) => r.codigo);
const completa = { podeAgendar: true, baseConhecimento: true, saudacao: "Bom dia" as const };

describe("contrato da ligação", () => {
  it("leva toda regra do turno do WhatsApp ou registra por que ficou de fora", () => {
    const fonte = readFileSync("src/lib/whatsapp.server.ts", "utf8");
    const inicio = fonte.indexOf("const instrucoesAdicionaisTurno");
    const fim = fonte.indexOf("const precedenciaTurno = resolverPrecedenciaDoTurno", inicio);
    expect(inicio).toBeGreaterThan(0);
    expect(fim).toBeGreaterThan(inicio);
    const doChat = new Set(
      [...fonte.slice(inicio, fim).matchAll(/codigo:\s*"([A-Z_]+)"/g)].map((m) => m[1]!),
    );
    expect(doChat.size).toBeGreaterThan(20);
    const naLigacao = new Set([
      ...codigos(completa),
      ...codigos({ ...completa, podeAgendar: false }),
    ]);
    const semDecisao = [...doChat].filter(
      (c) => !naLigacao.has(c) && !(c in REGRAS_WHATSAPP_FORA_DA_LIGACAO),
    );
    expect(semDecisao).toEqual([]);
  });

  it("troca formato de celular e foto pelas regras do canal de voz", () => {
    const c = codigos(completa);
    expect(c).toContain("CANAL_VOZ");
    expect(c).toContain("PEDIDO_MEDICO_LIGACAO");
    expect(c).toContain("FLUXO_SISTEMA_LIGACAO");
    expect(c).not.toContain("FORMATO_MOBILE_OBRIGATORIO");
    expect(c).not.toContain("SOLICITAR_FOTO_PEDIDO_MEDICO");
  });

  it("sem agenda usa a transição e tira as regras de vaga, como no chat", () => {
    const c = codigos({ ...completa, podeAgendar: false });
    expect(c).toContain("TRANSICAO_AGENDAMENTO_HUMANO");
    expect(c).not.toContain("AGENDAMENTO_POR_ITEM");
    for (const so of [
      "SOMENTE_PRIMEIRO_HORARIO",
      "TIPO_CONSULTA_ANTES_AGENDA",
      "ESCOLHA_ANTES_DOS_DETALHES",
      "CADASTRO_PESSOA_ATENDIDA",
    ])
      expect(c).not.toContain(so);
    expect(codigos(completa)).toContain("AGENDAMENTO_POR_ITEM");
  });

  it("pedido médico e dicionário só com a base de conhecimento", () => {
    const c = codigos({ ...completa, baseConhecimento: false });
    expect(c).not.toContain("PEDIDO_MEDICO_LIGACAO");
    expect(c).not.toContain("CONSULTAR_DICIONARIO_PUBLICADO");
  });

  it("usa o mesmo conjunto de ferramentas do WhatsApp", () => {
    const com = ferramentasDaLigacao(true).map((f) => f.function.name);
    const sem = ferramentasDaLigacao(false).map((f) => f.function.name);
    expect(com).toContain("agendar");
    expect(com).toContain("consultar_disponibilidade");
    expect(sem).not.toContain("consultar_disponibilidade");
    expect(sem).not.toContain("agendar");
    for (const lista of [com, sem]) {
      expect(lista).toContain("consultar_cadastro");
      expect(lista).toContain("solicitar_atendente_humano");
      expect(lista).toContain("solicitar_nome_atendimento");
    }
    for (const nome of com) expect(ROTULOS_FERRAMENTAS[nome]).toBeTruthy();
  });

  it("instruções da voz delegam o conteúdo e usam a identidade publicada", () => {
    const t = instrucoesCamadaVoz("Maria", "Clínica Teste");
    expect(t).toContain("Maria");
    expect(t).toContain("Clínica Teste");
    expect(t).toMatch(/delegue/i);
    expect(instrucoesCamadaVoz("", "")).toContain("a assistente");
  });
});

describe("ferramentas simuladas", () => {
  it("cada ferramenta que grava ou encaminha tem resposta simulada", () => {
    for (const nome of FERRAMENTAS_SIMULADAS_LIGACAO) {
      const r = resultadoSimulado(nome, {});
      expect(r?.ok).toBe(true);
      expect(r?.simulado).toBe(true);
    }
    expect(resultadoSimulado("consultar_cadastro", {})).toBeNull();
  });

  it("agendamento simulado traz id e sucesso, sem dados do paciente", () => {
    const r = resultadoSimulado("agendar", { nome: "Paciente Teste" }) as Record<string, unknown>;
    expect(r.success).toBe(true);
    expect(String(r.agendamento_id)).toStartWith("AGENDA-SIM-");
    expect(JSON.stringify(r)).not.toContain("Paciente Teste");
  });
});

describe("sessão de voz", () => {
  it("abre a voz com delegação client e sem gravar o áudio", () => {
    const corpo = corpoInicioSessao("voz", "marin", "v=0");
    expect(corpo.type).toBe("session.start");
    expect(corpo.session.model).toBe(MODELO_VOZ_LIGACAO);
    expect(corpo.session.store).toBe(false);
    expect(corpo.session.audio.output.voice).toBe("marin");
    expect(corpo.session.delegation).toEqual({ type: "client" });
    expect(corpo.transport).toEqual({ type: "webrtc", sdp: "v=0" });
  });
});

describe("eventos da ligação", () => {
  it("junta trechos da mesma pessoa e separa quando muda quem fala", () => {
    let e = aplicarEventoLigacao(ESTADO_INICIAL_LIGACAO, { type: "session.started" });
    e = aplicarEventoLigacao(e, { type: "session.output_transcript.delta", delta: "Bom dia" });
    e = aplicarEventoLigacao(e, { type: "session.output_transcript.delta", delta: ", tudo bem?" });
    e = aplicarEventoLigacao(e, { type: "session.input_transcript.delta", delta: " Quero marcar" });
    expect(e.status).toBe("em_andamento");
    expect(e.falas).toEqual([
      { id: 1, quem: "nina", texto: "Bom dia, tudo bem?" },
      { id: 2, quem: "paciente", texto: "Quero marcar" },
    ]);
  });

  it("lê a chamada de ferramenta aninhada ou direta", () => {
    const item = {
      type: "function_call",
      call_id: "c1",
      name: "consultar_cadastro",
      arguments: "{}",
    };
    const esperado = { callId: "c1", nome: "consultar_cadastro", argumentos: "{}" };
    expect(
      chamadaDoEvento({
        type: "response.event",
        event: { type: "response.output_item.done", item },
      }),
    ).toEqual(esperado);
    expect(chamadaDoEvento({ type: "response.output_item.done", item })).toEqual(esperado);
    expect(
      chamadaDoEvento({ type: "response.output_item.done", item: { type: "message" } }),
    ).toBeNull();
    expect(chamadaDoEvento(null)).toBeNull();
  });

  it("devolve o resultado e pede continuação", () => {
    const [resultado, continuar] = eventosResultadoFerramenta("c1", '{"ok":true}');
    expect(resultado).toMatchObject({
      type: "response.item.create",
      item: { type: "function_call_output", call_id: "c1", output: '{"ok":true}' },
    });
    expect(continuar?.type).toBe("response.create");
  });

  it("encerramento e erro não expõem detalhe técnico", () => {
    const fim = aplicarEventoLigacao(ESTADO_INICIAL_LIGACAO, {
      type: "session.closed",
      reason: "close_requested",
      usage: { seconds: 42 },
    });
    expect(fim).toMatchObject({ status: "encerrada", motivoFim: "close_requested", segundos: 42 });
    const erro = aplicarEventoLigacao(ESTADO_INICIAL_LIGACAO, {
      type: "error",
      error: { code: "x", message: "segredo interno" },
    });
    expect(erro.erro).toBe("Erro na ligação (x).");
  });
});

describe("velocidade da ligação", () => {
  it("usa o modelo de apoio leve pela API Responses e o limite de rodadas do chat", () => {
    expect(MODELO_APOIO_LIGACAO).toBe("openai/gpt-5.6-luna");
    expect(MODELOS_APOIO_LIGACAO).toEqual(["openai/gpt-5.6-luna", "openai/gpt-6-astra"]);
    expect(LIMITE_PASSOS_LIGACAO).toBe(LIMITE_RODADAS_COMUM);
  });

  it("junta os trechos da transcrição numa fala por pessoa", () => {
    const falas: { role: "user" | "assistant"; text: string }[] = [];
    juntarFala(falas, "user", "Quero");
    juntarFala(falas, "user", " marcar");
    juntarFala(falas, "assistant", "Claro");
    juntarFala(falas, "user", "cardiologia");
    expect(falas).toEqual([
      { role: "user", text: "Quero marcar" },
      { role: "assistant", text: "Claro" },
      { role: "user", text: "cardiologia" },
    ]);
  });

  it("trecho que chega depois de a fala ir para o modelo abre fala nova", () => {
    const falas: { role: "user" | "assistant"; text: string }[] = [{ role: "user", text: "Quero" }];
    juntarFala(falas, "user", " marcar", 1);
    expect(falas).toEqual([
      { role: "user", text: "Quero" },
      { role: "user", text: " marcar" },
    ]);
  });

  it("não manda ao modelo o 'só um instante' final da voz", () => {
    const chamada = {
      role: "assistant" as const,
      content: [{ type: "tool-call" as const, toolCallId: "c1", toolName: "x", input: {} }],
    };
    expect(
      semTurnoFinalDoAssistente([
        { role: "user", content: "clínico geral" },
        { role: "assistant", content: "Um instante, vou verificar." },
      ]),
    ).toEqual([{ role: "user", content: "clínico geral" }]);
    const comFerramenta = [{ role: "user" as const, content: "oi" }, chamada];
    expect(semTurnoFinalDoAssistente(comFerramenta)).toEqual(comFerramenta);
  });

  it("registra só o código do erro, sem conteúdo", () => {
    expect(codigoDoErro({ statusCode: 400, message: "conteúdo do pedido" })).toBe("HTTP 400");
    expect(codigoDoErro(new TypeError("x"))).toBe("TypeError");
    expect(codigoDoErro(null)).toBe("desconhecido");
  });
});
