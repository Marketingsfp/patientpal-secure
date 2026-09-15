/** POST real, persistência e agrupador reais; dependências externas isoladas no subprocesso. */
import { mock } from "bun:test";
import { createHmac } from "node:crypto";
import {
  agruparTurnoPersistido,
  ErroAgrupamentoNina,
  type EntradaAgrupamento,
} from "../../agrupamento-turno";
import { ErroReservaTurnoPerdida } from "../../reserva-turno";
import { entradaPermiteReabertura } from "../../reabertura-entrada";

type Linha = Record<string, any>;
const cenario = process.argv[2]!;
const paridade = cenario === "paridade-cardiologia";
const respostaCardiologia =
  "Temos Cardiologia. A consulta custa R$ 120,00 no dinheiro e R$ 145,00 no cartão.";
const entradasGerador: Linha[] = [];
const db: Record<string, Linha[]> = {
  nina_message_batches: [],
  whatsapp_mensagens: [],
  whatsapp_webhook_logs: [],
  whatsapp_configs: [],
};
let falhaInsert = cenario === "persistencia",
  falhaAgrupar = ["agrupamento", "grupo-encerramento-posterior"].includes(cenario);
let falhaRevisao = [
  "revisao",
  "revisao-resposta-perdida",
  "revisao-conversa-fechada",
  "verificacao-revisao",
].includes(cenario);
let fechada = cenario === "revisao-conversa-fechada";
let reservaPerdidaDepois = false;
let tts = 0,
  uploads = 0;
let closedAt = "2026-09-14T03:00:00.000Z";
const entradaEm = "2026-09-14T03:00:01.000Z";
let modelo = 0,
  transporte = 0,
  rede = 0,
  reaberturas = 0,
  revisao = 0,
  seq = 0;
const estados = new Map<string, string>();
const encerramentos: unknown[][] = [];
globalThis.fetch = Object.assign(
  async () => {
    rede++;
    throw new Error("Rede proibida na fixture");
  },
  {
    preconnect: () => {
      throw new Error("Rede proibida");
    },
  },
);
function consulta(tabela: string) {
  if (!(tabela in db)) throw new Error(`Tabela inesperada: ${tabela}`);
  let dados: Linha | null = null,
    patch: Linha | null = null,
    singular = false,
    pronta = false,
    resultado: any;
  const filtros: ((m: Linha) => boolean)[] = [];
  const executar = () => {
    if (pronta) return resultado;
    pronta = true;
    let linhas: Linha[];
    if (dados) {
      if (tabela === "whatsapp_mensagens" && dados.direction === "in" && falhaInsert)
        return (resultado = {
          data: null,
          error: { code: "08006", message: "Insert indisponível" },
        });
      if (
        tabela === "whatsapp_mensagens" &&
        db[tabela]!.some((m) => m.wa_message_id === dados!.wa_message_id)
      )
        return (resultado = { data: null, error: { code: "23505", message: "duplicate key" } });
      const linha = {
        id: `registro-${++seq}`,
        conversa_id: "conversa",
        created_at: entradaEm,
        ...dados,
      };
      db[tabela]!.push(linha);
      linhas = [linha];
    } else {
      linhas = db[tabela]!.filter((m) => filtros.every((f) => f(m)));
      if (patch) linhas.forEach((m) => Object.assign(m, patch));
    }
    return (resultado = { data: singular ? (linhas[0] ?? null) : linhas, error: null });
  };
  const q: any = {
    insert: (d: Linha) => {
      dados = d;
      return q;
    },
    update: (d: Linha) => {
      patch = d;
      return q;
    },
    select: () => q,
    eq: (k: string, v: any) => {
      filtros.push((m) => m[k] === v);
      return q;
    },
    is: (k: string, v: any) => {
      filtros.push((m) => (m[k] ?? null) === v);
      return q;
    },
    in: (k: string, vs: any[]) => {
      filtros.push((m) => vs.includes(m[k]));
      return q;
    },
    maybeSingle: () => {
      singular = true;
      return Promise.resolve(executar());
    },
    then: (r: (v: any) => unknown) => Promise.resolve(executar()).then(r),
  };
  return q;
}
mock.module("@tanstack/react-router", () => ({ createFileRoute: () => (opcoes: any) => opcoes }));
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: consulta,
    rpc: async (nome: string, args: any) => {
      if (nome !== "nina_revisao_registrar_entrada") throw new Error(`RPC não esperada ${nome}`);
      const mensagem = db.whatsapp_mensagens!.find((m) => m.id === args._mensagem_id)!;
      if (falhaRevisao && cenario !== "revisao-resposta-perdida")
        return { data: null, error: { message: "Revisão indisponível" } };
      if (!mensagem.nina_revisao_conversa) mensagem.nina_revisao_conversa = ++revisao;
      if (falhaRevisao) throw new Error("Resposta da revisão indisponível após commit");
      return { data: mensagem.nina_revisao_conversa, error: null };
    },
  },
}));
mock.module("@/lib/atendimento/latencia.server", () => ({
  iniciarTraceServidor: () => ({ marcar: () => {}, publicar: () => {} }),
}));
mock.module("@/lib/nina/revisao-conversa.server", () => ({
  incrementarRevisaoConversa: async () => ++revisao,
  respostaObsoleta: async () => false,
}));
mock.module("@/lib/integracoes/verificacao-v1.server", () => ({
  reconhecerCodigoVerificacao: async () =>
    cenario === "verificacao-revisao"
      ? { tratada: true, resposta: "Código confirmado." }
      : { tratada: false },
}));
mock.module("@/lib/nina/espera-timeout.server", () => ({
  processarTimeoutsEsperaPaciente: async () => {},
}));
mock.module("@/lib/nina/espera-paciente.server", () => ({
  limparEsperaPorTelefone: async () => {},
  registrarEsperaPorTelefone: async () => {},
}));
mock.module("@/lib/atendimento/handoff.server", () => ({
  reabrirConversaPorMensagemPaciente: async (args: any) => {
    if (
      !args.mensagemRecebidaEm ||
      (fechada && entradaPermiteReabertura(args.mensagemRecebidaEm, { closed_at: closedAt }))
    ) {
      reaberturas++;
      fechada = false;
    }
  },
  estadoConversaPorTelefone: async () => ({
    id: "conversa",
    owner_type: "AI",
    ai_enabled: true,
    status: fechada ? "closed" : "open",
  }),
  ninaPodeResponder: () => true,
}));
mock.module("@/lib/nina-desligada.server", () => ({ ninaDesativadaNaClinica: async () => false }));
mock.module("@/lib/whatsapp-midia.server", () => ({
  transcreverAudioWhatsapp: async () => ({ texto: "Bom dia", mime: "audio/ogg" }),
  RESPOSTA_AUDIO_FALHOU: "Áudio indisponível",
  respostaMidiaNaoSuportada: () => "Mídia indisponível",
}));
mock.module("@/lib/nina/burst.server", () => ({
  aguardarTurnoNina: async (entrada: EntradaAgrupamento) =>
    agruparTurnoPersistido(entrada, {
      registrar: async () => {
        if (falhaAgrupar) throw new ErroAgrupamentoNina("RPC indisponível antes de iniciar");
        const batchId = entrada.mensagemId!;
        if (!estados.has(batchId)) estados.set(batchId, "COLLECTING");
        return { batchId, revision: revisao, primeiraMs: 0 };
      },
      adquirir: async (batchId) => ({ chave: "clinica:5511999991111", token: batchId }),
      reivindicar: async (batchId) => {
        if (estados.get(batchId) !== "COLLECTING") return null;
        estados.set(batchId, "PROCESSING");
        return [entrada.mensagemId!];
      },
      validarConversa: async () => !fechada,
      lerMensagens: async (ids) =>
        db
          .whatsapp_mensagens!.filter((m) => ids.includes(m.id))
          .map((m) => ({ id: m.id, texto: m.body })),
      lerRevisao: async () => revisao,
      iniciar: async () => true,
      concluir: async (id) => {
        estados.set(id, "SUPERSEDED");
      },
      liberar: async () => {},
      esperar: async () => {},
      agora: () => 3000,
    }),
  validarReservaTurnoNina: async () => cenario !== "reserva-perdida" && !reservaPerdidaDepois,
  concluirTurnoNina: async (...args: unknown[]) => {
    encerramentos.push(args);
    estados.set(String(args[0]), String(args[3]));
  },
}));
mock.module("@/lib/whatsapp.server", () => ({
  metaUploadMedia: async () => {
    uploads++;
    if (cenario === "reserva-perdida-upload") reservaPerdidaDepois = true;
    return "audio-upload";
  },
  metaSendAudio: async () => {
    transporte++;
    return { wa_message_id: `saida-${transporte}` };
  },
  loadWhatsAppConfig: async () => ({
    access_token: "token-ficticio",
    app_secret: "segredo-ficticio",
    phone_number_id: "telefone-clinica",
    display_phone_number: "5511999990000",
  }),
  gerarRespostaNina: async (_c: string, _t: string, _p: string, opcoes: any) => {
    modelo++;
    entradasGerador.push({
      clinicaId: _c,
      texto: _t,
      telefone: _p,
      opcoes: { ...opcoes, auditoria: undefined, validarReservaTurno: undefined },
      temAuditoria: Boolean(opcoes.auditoria),
      temGuardaReserva: typeof opcoes.validarReservaTurno === "function",
    });
    opcoes.auditoria.execucaoId = "execucao";
    opcoes.auditoria.traceId = "turno";
    if (!(await opcoes.validarReservaTurno())) throw new ErroReservaTurnoPerdida();
    if (cenario === "erro-modelo") throw new Error("Falha após início do modelo");
    return paridade ? respostaCardiologia : "Olá! Como posso ajudar?";
  },
  metaSendText: async () => {
    transporte++;
    return { wa_message_id: `saida-${transporte}` };
  },
}));
mock.module("@/lib/nina/resposta/finalizacao.server", () => ({
  finalizarResposta: async (d: any) => {
    if (cenario === "reserva-perdida-finalizacao") reservaPerdidaDepois = true;
    return { ...d.resultado, encerrarConversaId: null };
  },
}));
mock.module("@/lib/nina-audio.server", () => ({
  respostaAudioDesativada: async () => false,
  prepararParaFala: (s: string) => s,
  pareceLista: () => false,
  resumoFalado: (s: string) => s,
  LIMITE_FALA_CURTA: 500,
  sintetizarFala: async () => {
    tts++;
    if (cenario === "reserva-perdida-tts") reservaPerdidaDepois = true;
    return { bytes: new Uint8Array([1, 2]), mime: "audio/ogg", ext: "ogg" };
  },
}));
mock.module("@/lib/nina/confidence-engine.server", () => ({
  registrarEntregaSaida: async () => {},
}));
mock.module("@/lib/nina/rastreio/turno.server", () => ({
  registrarTurnoSemModelo: async () => {},
  gravarEntregaDoTurno: async () => {},
}));

const { Route } = await import("@/routes/api/public/whatsapp.$clinicaId");
const post = (Route as any).server.handlers.POST;
const corpo = JSON.stringify({
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: "telefone-clinica" },
            messages: [
              {
                id: "wa-entrada",
                from: "5511999991111",
                type: ["reserva-perdida-tts", "reserva-perdida-upload"].includes(cenario)
                  ? "audio"
                  : "text",
                audio: { id: "audio-entrada" },
                text: { body: paridade ? "Vocês tem cardiologista?" : "Bom dia" },
              },
            ],
          },
        },
      ],
    },
  ],
});
const enviar = async () =>
  post({
    params: { clinicaId: "clinica" },
    request: new Request("https://teste.local/api/public/whatsapp/clinica", {
      method: "POST",
      body: corpo,
      headers: {
        "x-hub-signature-256": `sha256=${createHmac("sha256", "segredo-ficticio").update(corpo).digest("hex")}`,
      },
    }),
  });
const primeira = await enviar();
const antesRetry = {
  modelo,
  transporte,
  entradas: db.whatsapp_mensagens!.filter((m) => m.direction === "in").length,
};
falhaInsert = false;
falhaAgrupar = false;
falhaRevisao = false;
if (cenario === "grupo-encerramento-posterior") {
  fechada = true;
  closedAt = "2026-09-14T03:00:02.000Z";
}
const segunda = await enviar();
if (cenario === "verificacao-revisao") await enviar();
console.log(
  "WEBHOOK_RESULTADO=" +
    JSON.stringify({
      primeira: primeira.status,
      segunda: segunda.status,
      antesRetry,
      tts,
      uploads,
      modelo,
      transporte,
      rede,
      revisao,
      reaberturas,
      encerramentos,
      entradasGerador,
      entradas: db.whatsapp_mensagens!.filter((m) => m.direction === "in"),
      saidas: db.whatsapp_mensagens!.filter((m) => m.direction === "out"),
      logs: db.whatsapp_webhook_logs!.map((l) => l.resultado),
    }),
);
