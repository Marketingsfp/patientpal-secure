import { mock } from "bun:test";
import assert from "node:assert/strict";

// Substitui apenas armazenamento/transporte. Coordenador e handoff são os reais.
type Linha = Record<string, any>;
let tabelas: Record<string, Linha[]> = {};
let revisao = 16;
let atribuicoes = 0;
let avisos = 0;
let antesDeTransferir: (() => void) | null = null;
let atendenteOnline = true;
const eventos: Linha[] = [];
const conv = () => tabelas.atend_conversas![0]!;
const lote = () => tabelas.nina_message_batches![0]!;

const admin = {
  from(tabela: string) {
    let patch: Linha | null = null,
      insercao: Linha | null = null;
    let unica = false;
    const filtros: Array<(l: Linha) => boolean> = [];
    const campo = (linha: Linha, coluna: string) => {
      const [base, json] = coluna.split("->>");
      return json ? (linha[base!]?.[json] ?? null) : linha[base!];
    };
    const resultado = () => {
      if (patch && tabela === "atend_conversas" && patch.owner_type === "NONE") {
        const simularCorrida = antesDeTransferir;
        antesDeTransferir = null;
        simularCorrida?.();
      }
      const linhas = tabelas[tabela] ?? (tabelas[tabela] = []);
      if (insercao) linhas.push({ id: crypto.randomUUID(), ...insercao });
      const encontradas = insercao
        ? [linhas.at(-1)!]
        : linhas.filter((l) => filtros.every((f) => f(l)));
      if (patch) encontradas.forEach((l) => Object.assign(l, patch));
      return {
        data: structuredClone(unica ? (encontradas[0] ?? null) : encontradas),
        count: encontradas.length,
        error: null,
      };
    };
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => {
        filtros.push((l) => campo(l, k) === v);
        return q;
      },
      is: (k: string, v: any) => {
        filtros.push((l) => campo(l, k) === v);
        return q;
      },
      in: (k: string, v: any[]) => {
        filtros.push((l) => v.includes(l[k]));
        return q;
      },
      not: (k: string, _op: string, v: string) => {
        const valores = v.replace(/[()"]/g, "").split(",");
        filtros.push((l) => !valores.includes(l[k]));
        return q;
      },
      lte: (k: string, v: any) => {
        filtros.push((l) => l[k] <= v);
        return q;
      },
      order: () => q,
      limit: () => q,
      update: (v: Linha) => {
        patch = v;
        return q;
      },
      insert: (v: Linha) => {
        insercao = v;
        return q;
      },
      single: () => {
        unica = true;
        return Promise.resolve(resultado());
      },
      maybeSingle: () => {
        unica = true;
        return Promise.resolve(resultado());
      },
      then: (a: any, b: any) => Promise.resolve(resultado()).then(a, b),
    };
    return q;
  },
  async rpc(nome: string, args: Linha) {
    if (nome === "atend_auto_assign_conversa") {
      atribuicoes++;
      assert.equal(conv().is_teste, false, "teste jamais ocupa pessoa real");
      if (!atendenteOnline) return { data: null, error: null };
      Object.assign(conv(), {
        owner_type: "HUMAN",
        ai_enabled: false,
        atribuida_user_id: "atendente",
        status: "human_attending",
      });
      return { data: "atendente", error: null };
    }
    if (nome === "nina_revisao_atual") return { data: revisao, error: null };
    if (nome === "nina_watchdog_iniciar")
      return {
        data: { attempt: lote().attempt_count, maxAttempts: 3, snapshot: lote().response_snapshot },
        error: null,
      };
    if (nome === "nina_watchdog_evento") {
      eventos.push({ nome: args._evento, ...args._dados });
      return { data: null, error: null };
    }
    assert.equal(args._token, lote().watchdog_token);
    assert.equal(lote().watchdog_state, "processing");
    if (nome === "nina_watchdog_checkpoint") {
      lote().watchdog_stage = args._etapa;
      if (args._snapshot) lote().response_snapshot = args._snapshot;
      return { data: true, error: null };
    }
    if (nome === "nina_watchdog_finalizar") {
      if (args._estado === "handoff") assert(["NONE", "HUMAN"].includes(conv().owner_type));
      Object.assign(lote(), {
        watchdog_state: args._estado,
        erro_tecnico: args._erro,
        next_retry_at: args._estado === "retry_pending" ? "agendada" : null,
      });
      return { data: true, error: null };
    }
    throw Error("RPC inesperada: " + nome);
  },
};
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: admin }));
mock.module("../../../nina-desligada.server", () => ({
  ninaDesativadaNaClinica: async () => false,
}));
mock.module("../../../atendimento/handoff-resumo.server", () => ({
  reservarResumoHandoff: async () => {},
  arquivarResumosConversa: async () => {},
}));
mock.module("../../../atendimento/handoff-auditoria.server", () => ({
  registrarAuditoriaHandoff: async () => {},
}));
mock.module("../../../atendimento/protocolo-atendimento.server", () => ({
  protocoloAoIniciarHandoff: async () => {
    avisos++;
    return {
      protocolo: "TESTE-1",
      anuncio: { aviso: { entregue: true, mensagemId: "aviso", estado: "confirmado" } },
    };
  },
  protocoloAoAtribuirHumano: async () => {},
}));
const {
  carregarControleWatchdog,
  gerarComCheckpointNina,
  finalizarWatchdogNina,
  ErroEntregaWatchdog,
} = await import("../../watchdog.server");
const { contextoWatchdog } = await import("../../watchdog-contexto.server");
const { executarFerramentaPaciente } = await import("../../paciente-tools.server");
const { reabrirConversaPorMensagemPaciente } = await import("../../../atendimento/handoff.server");
const { ErroReservaTurnoPerdida } = await import("../../reserva-turno");

async function preparar(teste = false) {
  tabelas = {
    atend_conversas: [
      {
        id: "conversa",
        clinica_id: "clinica",
        contato_telefone: "55000000000",
        status: "bot_attending",
        owner_type: "AI",
        ai_enabled: true,
        atribuida_user_id: null,
        updated_at: new Date().toISOString(),
        ultima_msg_em: new Date().toISOString(),
        is_teste: teste,
        nina_fluxo_estado: {},
        teste_ciclo_id: "ciclo",
      },
    ],
    nina_message_batches: [
      {
        id: "lote",
        clinica_id: "clinica",
        conversa_id: "conversa",
        telefone: "55000000000",
        watchdog_state: "processing",
        watchdog_token: "token",
        watchdog_revision: 16,
        watchdog_stage: "preparing",
        attempt_count: 1,
        response_snapshot: null,
        created_at: new Date().toISOString(),
      },
    ],
    nina_batch_entregas: [],
    atend_departamentos: [],
    profiles: [{ id: "atendente", nome: "Atendente de teste" }],
    nina_teste_ciclos: [{ id: "ciclo", nina_session_id: "sessao" }],
  };
  revisao = 16;
  atribuicoes = 0;
  avisos = 0;
  eventos.length = 0;
  antesDeTransferir = null;
  atendenteOnline = true;
  const controle = await carregarControleWatchdog({
    batchId: "lote",
    lock: { chave: "clinica:55000000000", token: "token" },
    texto: "Oi boa tarde",
    mensagens: ["entrada"],
    revisao: 16,
  });
  assert(controle);
  return controle;
}
const erroBind = new TypeError("Cannot read properties of undefined (reading 'bind')");

// Regressão do caso: encerrada -> entrada nova -> Nina -> erro antes do modelo -> humano.
for (const teste of [false, true]) {
  const controle = await preparar(teste);
  Object.assign(conv(), {
    status: "closed",
    resolved_at: "2026-09-16T20:03:08Z",
    closed_at: "2026-09-16T20:03:08Z",
  });
  await reabrirConversaPorMensagemPaciente({
    clinicaId: "clinica", telefone: "55000000000", mensagemOrigemId: "entrada-reabertura",
  });
  const reabertura = tabelas.atend_conversa_eventos.find((e) => e.evento === "REABERTA");
  const atribuicaoNina = tabelas.atend_conversa_eventos.find((e) => e.evento === "ATRIBUIDA_IA");
  assert.equal(reabertura?.detalhes.mensagem_origem_id, "entrada-reabertura");
  assert.equal(atribuicaoNina?.detalhes.mensagem_origem_id, "entrada-reabertura");
  assert.equal(atribuicaoNina?.detalhes.reabertura_evento_id, reabertura?.id);
  lote().created_at = new Date(Date.now() + 1000).toISOString();
  assert.equal(conv().status, "bot_attending");
  let chamadas = 0;
  try {
    await gerarComCheckpointNina(controle, {}, async () => {
      chamadas++;
      throw erroBind;
    });
  } catch (e) {
    await finalizarWatchdogNina(controle, e);
  }
  assert.equal(chamadas, 1);
  assert.equal(lote().watchdog_state, "handoff");
  assert.match(lote().erro_tecnico, /reading 'bind'/);
  assert.equal(conv().ai_enabled, false);
  assert.equal(conv().owner_type, teste ? "NONE" : "HUMAN");
  assert.equal(atribuicoes, teste ? 0 : 1);
  assert.equal(avisos, 1);
  assert(eventos.some((e) => e.nome === "PROCESSING_ERROR_HANDOFF" && e.aviso_confirmado));
  await finalizarWatchdogNina(controle, erroBind);
  assert.equal(avisos, 1, "finalização repetida não avisa outra vez");
}

// Instabilidade comprovada antes de qualquer efeito: retry, depois sucesso sem handoff.
let controle = await preparar();
await finalizarWatchdogNina(controle, new Error("fetch failed"));
assert.equal(lote().watchdog_state, "retry_pending");
assert.equal(avisos, 0);
assert.equal(atribuicoes, 0);
Object.assign(lote(), { watchdog_state: "processing", attempt_count: 2 });
controle = (await carregarControleWatchdog({
  batchId: "lote",
  lock: controle.lock,
  texto: "Oi",
  mensagens: ["entrada"],
  revisao: 16,
}))!;
assert.equal(await gerarComCheckpointNina(controle, {}, async () => "Olá!"), "Olá!");
tabelas.nina_batch_entregas!.push({ batch_id: "lote", estado: "confirmed", parte: "texto" });
await finalizarWatchdogNina(controle);
assert.equal(lote().watchdog_state, "completed");
assert.equal(avisos, 0);

controle = await preparar();
lote().attempt_count = 3;
await finalizarWatchdogNina(controle, new Error("fetch failed"));
assert.equal(lote().watchdog_state, "handoff", "limite não deixa conversa na IA");

controle = await preparar();
atendenteOnline = false;
await finalizarWatchdogNina(controle, erroBind);
assert.equal(conv().owner_type, "NONE");
assert.equal(conv().status, "waiting");
assert.equal(lote().watchdog_state, "handoff");

// Ferramenta direta do gate deve retirar a autorização para repetir preparação.
controle = await preparar();
await contextoWatchdog.run(controle, () =>
  executarFerramentaPaciente(
    {
      clinicaId: "clinica",
      conversaId: "conversa",
      pacienteId: null,
      pacienteNome: null,
      telefone: null,
      origem: "whatsapp",
    },
    "ferramenta_inexistente",
    {},
  ),
);
assert.equal(lote().watchdog_stage, "generating");
await finalizarWatchdogNina(controle, new Error("timeout"));
assert.equal(lote().watchdog_state, "handoff");

// Dono, sessão, revisão ou reserva mudaram: a falha antiga não assume o atendimento.
for (const motivo of [
  "closed",
  "sessao",
  "revisao",
  "humano",
  "reserva",
  "corrida",
  "nova_mensagem",
  "reset",
]) {
  controle = await preparar();
  if (motivo === "closed") conv().status = "closed";
  if (motivo === "sessao")
    conv().nina_fluxo_estado = { session_started_at: new Date(Date.now() + 10000).toISOString() };
  if (motivo === "revisao") revisao++;
  if (motivo === "humano")
    Object.assign(conv(), { owner_type: "HUMAN", atribuida_user_id: "outro" });
  if (motivo === "corrida")
    antesDeTransferir = () => Object.assign(conv(), { status: "closed", updated_at: "mudou" });
  if (motivo === "nova_mensagem")
    antesDeTransferir = () => Object.assign(conv(), { ultima_msg_em: "mensagem posterior" });
  if (motivo === "reset")
    antesDeTransferir = () =>
      Object.assign(conv(), { nina_fluxo_estado: { session_id: "nova sessao" } });
  await finalizarWatchdogNina(
    controle,
    motivo === "reserva" ? new ErroReservaTurnoPerdida() : erroBind,
  );
  assert.equal(avisos, 0, motivo);
  assert.equal(atribuicoes, 0, motivo);
  if (motivo === "corrida" || motivo === "closed") assert.equal(conv().status, "closed");
  if (motivo === "humano") assert.equal(conv().atribuida_user_id, "outro");
}

controle = await preparar();
antesDeTransferir = () => Object.assign(conv(), { updated_at: "leitura da Inbox" });
await finalizarWatchdogNina(controle, erroBind);
assert.equal(lote().watchdog_state, "handoff", "leitura da Inbox não impede encaminhamento");

// Entrega incerta não permite novo envio, nem passa por retry de preparação.
controle = await preparar();
tabelas.nina_batch_entregas!.push({ batch_id: "lote", estado: "uncertain", parte: "texto" });
await finalizarWatchdogNina(controle, new ErroEntregaWatchdog(false, true));
assert.equal(lote().watchdog_state, "failed");
assert.equal(lote().erro_tecnico, "DELIVERY_OUTCOME_UNKNOWN");
assert.equal(avisos, 0);
console.log("WATCHDOG_FALHA_OK");
