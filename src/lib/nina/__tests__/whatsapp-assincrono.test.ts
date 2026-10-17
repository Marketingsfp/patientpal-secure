import { describe, expect, test } from "bun:test";
import {
  despacharRespostaNina,
  executarTarefaWhatsapp,
  respostaAssincronaLigada,
  type DependenciasTarefa,
} from "../whatsapp-assincrono.server";
import { ErroAgrupamentoNina } from "../agrupamento-turno";
import { textoDaEntradaGravada } from "../entrada-whatsapp";

// Resposta da Nina acionada pelo banco. Dados fictícios.
const SEGREDO = "s".repeat(72);
const TAREFA = "11111111-1111-4111-8111-111111111111";
const TOKEN = "22222222-2222-4222-8222-222222222222";
const CLINICA = "33333333-3333-4333-8333-333333333333";
const MENSAGEM = "44444444-4444-4444-8444-444444444444";

type Linha = Record<string, any>;

function cenario(
  o: {
    tarefa?: Partial<Linha> | null;
    mensagem?: Partial<Linha> | null;
    conversa?: Linha | null;
    estado?: Linha | null;
    podeResponder?: boolean;
    desativada?: boolean;
    processar?: DependenciasTarefa["processar"];
    erroAssumir?: boolean;
  } = {},
) {
  const rpcs: { nome: string; args: any }[] = [];
  const processados: any[] = [];
  const atribuidos: any[] = [];
  const encaminhados: any[] = [];
  const esperas: number[] = [];
  const tabelas: Record<string, Linha | null> = {
    sistema_job_tokens: { token: SEGREDO },
    whatsapp_mensagens:
      o.mensagem === null
        ? null
        : {
            id: MENSAGEM,
            clinica_id: CLINICA,
            direction: "in",
            tipo: "text",
            body: "Bom dia",
            from_number: "5500000000001",
            to_number: "5500000000000",
            nina_status: null,
            ...o.mensagem,
          },
    atend_conversas: o.conversa === undefined ? null : o.conversa,
  };
  const admin = {
    from: (t: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: tabelas[t] ?? null, error: null }),
      };
      return q;
    },
    rpc: async (nome: string, args: any) => {
      rpcs.push({ nome, args });
      if (nome === "nina_whatsapp_assumir") {
        if (o.erroAssumir) return { data: null, error: { message: "indisponível" } };
        if (o.tarefa === null) return { data: [], error: null };
        return {
          data: [
            {
              clinica_id: CLINICA,
              mensagem_id: MENSAGEM,
              audio_falhou: false,
              phone_number_id: "123456",
              modo: "responder",
              diagnostico_segundos: null,
              tentativas: 1,
              ...o.tarefa,
            },
          ],
          error: null,
        };
      }
      return { data: true, error: null };
    },
  };
  const d: DependenciasTarefa = {
    admin,
    processar:
      o.processar ??
      (async (e) => {
        processados.push(e);
        return {};
      }),
    carregarConfig: async () => ({
      access_token: "token-ficticio",
      phone_number_id: "999",
      display_phone_number: "5500000000000",
    }),
    estadoConversaPorTelefone: async () =>
      o.estado === undefined ? { id: "conversa", atribuida_user_id: null } : o.estado,
    ninaPodeResponder: () => o.podeResponder ?? true,
    ninaDesativada: async () => o.desativada ?? false,
    atribuirAtendenteOnline: async (a) => {
      atribuidos.push(a);
    },
    encaminharParaHumano: async (a) => {
      encaminhados.push(a);
      return { ok: true };
    },
    esperar: async (ms) => {
      esperas.push(ms);
    },
  };
  const desfecho = () => rpcs.find((r) => r.nome === "nina_whatsapp_finalizar")?.args;
  return { d, rpcs, processados, atribuidos, encaminhados, esperas, desfecho };
}

function pedido(corpo: unknown = { tarefa: TAREFA, token: TOKEN }, token: string | null = SEGREDO) {
  return new Request("https://teste.local/api/public/nina/processar", {
    method: "POST",
    headers: token ? { "x-job-token": token } : {},
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

describe("rota da tarefa: autenticação e pedido", () => {
  test("sem token, token errado ou pedido fora do formato não assumem nada", async () => {
    for (const [req, status] of [
      [pedido(undefined, null), 401],
      [pedido(undefined, "x".repeat(72)), 401],
      [pedido({ tarefa: TAREFA }), 400],
      [pedido({ tarefa: TAREFA, token: TOKEN, clinicaId: CLINICA }), 400],
      [pedido("não é json"), 400],
    ] as const) {
      const c = cenario();
      const r = await executarTarefaWhatsapp(req, c.d);
      expect(r.status).toBe(status);
      expect(c.rpcs).toHaveLength(0);
    }
  });

  test("tarefa já assumida ou antiga é ignorada sem desfecho", async () => {
    const c = cenario({ tarefa: null });
    const r = await executarTarefaWhatsapp(pedido(), c.d);
    expect(await r.json()).toEqual({ ignorada: true });
    expect(c.desfecho()).toBeUndefined();
    expect(c.processados).toHaveLength(0);
  });

  test("reserva indisponível devolve 503 sem processar", async () => {
    const c = cenario({ erroAssumir: true });
    expect((await executarTarefaWhatsapp(pedido(), c.d)).status).toBe(503);
    expect(c.processados).toHaveLength(0);
  });
});

describe("rota da tarefa: resposta da Nina", () => {
  test("monta a mesma entrada do webhook a partir da mensagem gravada", async () => {
    const c = cenario();
    await executarTarefaWhatsapp(pedido(), c.d);
    expect(c.processados).toHaveLength(1);
    const e = c.processados[0];
    expect(e).toMatchObject({
      clinicaId: CLINICA,
      phoneNumberId: "123456",
      webhookPhoneNumberId: "123456",
      displayPhoneNumber: "5500000000000",
      from: "5500000000001",
      fromDigits: "5500000000001",
      convId: "conversa",
      textoPaciente: "Bom dia",
      audioFalhou: false,
      ehAudio: false,
      tipo: "text",
    });
    expect(e.msgInserida.id).toBe(MENSAGEM);
    expect(c.desfecho()).toMatchObject({ _resultado: "concluida", _aguardar_ms: 0 });
  });

  test("áudio, foto e lista usam o texto gravado; sem número da Meta, vale o da configuração", async () => {
    const c = cenario({
      tarefa: { audio_falhou: true, phone_number_id: null },
      mensagem: { tipo: "audio", body: "🎤 [áudio não transcrito]", transcricao: null },
    });
    await executarTarefaWhatsapp(pedido(), c.d);
    expect(c.processados[0]).toMatchObject({
      textoPaciente: "",
      audioFalhou: true,
      ehAudio: true,
      phoneNumberId: "999",
    });
    expect(textoDaEntradaGravada({ tipo: "image", body: "📷 Imagem", transcricao: "ECG" })).toBe(
      "ECG",
    );
    expect(textoDaEntradaGravada({ tipo: "interactive", body: "5 - Excelente" })).toBe("5");
    expect(textoDaEntradaGravada({ tipo: "interactive", body: "[interactive]" })).toBe("");
    expect(textoDaEntradaGravada({ tipo: "sticker", body: "[sticker]" })).toBe("");
  });

  test("entrada já tratada (como na reentrega da Meta) conclui sem chamar a Nina", async () => {
    for (const m of [
      { execucao_id: "exec" },
      { tratada_internamente: true },
      { nina_status: "handoff" },
    ]) {
      const c = cenario({ mensagem: m });
      await executarTarefaWhatsapp(pedido(), c.d);
      expect(c.processados).toHaveLength(0);
      expect(c.desfecho()).toMatchObject({ _resultado: "concluida" });
    }
  });

  test("pessoa assumiu nesse meio-tempo: a Nina não responde", async () => {
    const c = cenario({
      podeResponder: false,
      estado: { id: "conversa", atribuida_user_id: "u1" },
    });
    await executarTarefaWhatsapp(pedido(), c.d);
    expect(c.processados).toHaveLength(0);
    expect(c.atribuidos).toHaveLength(0);
    expect(c.desfecho()).toMatchObject({ _resultado: "concluida" });
  });

  test("Nina desligada e conversa sem responsável: distribui como o webhook", async () => {
    const c = cenario({ desativada: true });
    await executarTarefaWhatsapp(pedido(), c.d);
    expect(c.processados).toHaveLength(0);
    expect(c.atribuidos).toEqual([
      { clinicaId: CLINICA, conversaId: "conversa", departamentoId: null },
    ]);
  });

  test("conversa ocupada volta para a fila com espera, em vez do 503 para a Meta", async () => {
    const c = cenario({ processar: async () => ({ pendente: true }) });
    await executarTarefaWhatsapp(pedido(), c.d);
    const f = c.desfecho();
    expect(f._resultado).toBe("repetir");
    expect(f._aguardar_ms).toBeGreaterThan(0);
    expect(f._erro).toBe("CONVERSA_OCUPADA");
  });

  test("agrupamento pendente repete; outra falha encerra sem repetir", async () => {
    const pend = cenario({
      processar: async () => {
        throw new ErroAgrupamentoNina("RPC indisponível");
      },
    });
    await executarTarefaWhatsapp(pedido(), pend.d);
    expect(pend.desfecho()._resultado).toBe("repetir");
    const falha = cenario({
      processar: async () => {
        throw new Error("Falha após início do modelo");
      },
    });
    await executarTarefaWhatsapp(pedido(), falha.d);
    expect(falha.desfecho()).toMatchObject({ _resultado: "falhou", _erro: "PROCESSAMENTO_FALHOU" });
  });

  test("mensagem apagada ou WhatsApp sem token encerram como falha", async () => {
    const c = cenario({ mensagem: null });
    await executarTarefaWhatsapp(pedido(), c.d);
    expect(c.desfecho()).toMatchObject({ _resultado: "falhou", _erro: "ENTRADA_AUSENTE" });
    const s = cenario();
    s.d.carregarConfig = async () => ({ access_token: null });
    await executarTarefaWhatsapp(pedido(), s.d);
    expect(s.desfecho()).toMatchObject({ _resultado: "falhou", _erro: "WHATSAPP_NOT_CONFIGURED" });
  });

  test("renova a reserva enquanto a Nina trabalha", async () => {
    const c = cenario({
      processar: async () => {
        await new Promise((r) => setTimeout(r, 60));
        return {};
      },
    });
    c.d.heartbeatMs = 10;
    await executarTarefaWhatsapp(pedido(), c.d);
    expect(c.rpcs.filter((r) => r.nome === "nina_whatsapp_renovar").length).toBeGreaterThan(0);
  });
});

describe("rota da tarefa: encaminhamento e diagnóstico", () => {
  test("modo encaminhar avisa e manda para a equipe pelo caminho padrão", async () => {
    const c = cenario({
      tarefa: { modo: "encaminhar" },
      conversa: {
        owner_type: "AI",
        ai_enabled: true,
        ultima_msg_em: "2026-10-17T10:00:00Z",
        nina_fluxo_estado: { session_id: "sessao" },
      },
    });
    await executarTarefaWhatsapp(pedido(), c.d);
    expect(c.processados).toHaveLength(0);
    expect(c.encaminhados).toHaveLength(1);
    expect(c.encaminhados[0]).toMatchObject({
      clinicaId: CLINICA,
      conversaId: "conversa",
      solicitadoPor: "SISTEMA",
      somenteSeNina: { ultimaMsgEm: "2026-10-17T10:00:00Z", sessaoId: "sessao" },
    });
    expect(c.encaminhados[0].motivo).toStartWith("NINA_PROCESSING_FAILED");
    expect(c.desfecho()._resultado).toBe("concluida");
  });

  test("modo encaminhar não avisa conversa que já está com gente", async () => {
    const c = cenario({
      tarefa: { modo: "encaminhar" },
      conversa: { owner_type: "HUMAN", ai_enabled: false },
    });
    await executarTarefaWhatsapp(pedido(), c.d);
    expect(c.encaminhados).toHaveLength(0);
    expect(c.desfecho()._resultado).toBe("concluida");
  });

  test("diagnóstico espera o tempo pedido e conclui", async () => {
    const c = cenario({
      tarefa: {
        modo: "diagnostico",
        clinica_id: null,
        mensagem_id: null,
        diagnostico_segundos: 90,
      },
    });
    const r = await executarTarefaWhatsapp(pedido(), c.d);
    expect(r.status).toBe(200);
    expect(c.esperas).toEqual([90_000]);
    expect(c.processados).toHaveLength(0);
    expect(c.desfecho()._resultado).toBe("concluida");
  });

  test("nova tentativa de conversa ocupada: espera o intervalo antes de chamar a Nina", async () => {
    const c = cenario({ tarefa: { aguardar_ms: 12_000 } });
    const ordem: string[] = [];
    c.d.esperar = async (ms) => {
      ordem.push(`esperou ${ms}`);
    };
    c.d.processar = async () => {
      ordem.push("Nina");
      return {};
    };
    await executarTarefaWhatsapp(pedido(), c.d);
    expect(ordem).toEqual(["esperou 12000", "Nina"]);
  });

  test("espera limitada a 30 s; sem espera, chama a Nina direto", async () => {
    const longa = cenario({ tarefa: { aguardar_ms: 90_000 } });
    await executarTarefaWhatsapp(pedido(), longa.d);
    expect(longa.esperas).toEqual([30_000]);
    const sem = cenario({ tarefa: { aguardar_ms: 0 } });
    await executarTarefaWhatsapp(pedido(), sem.d);
    expect(sem.esperas).toEqual([]);
    expect(sem.processados).toHaveLength(1);
  });
});

describe("webhook: chave e despacho", () => {
  const admin = (flag: unknown, rpc: unknown) => ({
    from: () => {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => flag,
      };
      return q;
    },
    rpc: async () => rpc,
  });

  test("chave só vale ligada; erro de leitura mantém o caminho de sempre", async () => {
    expect(
      await respostaAssincronaLigada(admin({ data: { ativo: true }, error: null }, null), CLINICA),
    ).toBe(true);
    expect(
      await respostaAssincronaLigada(admin({ data: { ativo: false }, error: null }, null), CLINICA),
    ).toBe(false);
    expect(await respostaAssincronaLigada(admin({ data: null, error: null }, null), CLINICA)).toBe(
      false,
    );
    expect(
      await respostaAssincronaLigada(admin({ data: null, error: { message: "x" } }, null), CLINICA),
    ).toBe(false);
    const quebrado = {
      from: () => {
        throw new Error("Tabela inesperada");
      },
    };
    expect(await respostaAssincronaLigada(quebrado, CLINICA)).toBe(false);
  });

  test("despacho só conta quando o banco devolve a tarefa", async () => {
    const args = {
      clinicaId: CLINICA,
      mensagemId: MENSAGEM,
      audioFalhou: false,
      phoneNumberId: "1",
    };
    expect(await despacharRespostaNina(admin(null, { data: TAREFA, error: null }), args)).toBe(
      true,
    );
    expect(await despacharRespostaNina(admin(null, { data: null, error: null }), args)).toBe(false);
    expect(
      await despacharRespostaNina(admin(null, { data: null, error: { message: "x" } }), args),
    ).toBe(false);
    const quebrado = {
      rpc: async () => {
        throw new Error("rede");
      },
    };
    expect(await despacharRespostaNina(quebrado, args)).toBe(false);
  });
});
