import { beforeEach, expect, it, mock } from "bun:test";

// Rotinas reais de reset/entrada/lease; somente persistência e IA são simuladas.
type Row = Record<string, any>;
let bd: Record<string, Row[]>;
let reservas: Map<string, string>;
let eventoIniciado: () => void;
let continuarReset: () => void;
let iniciou: Promise<void>;
let continuar: Promise<void>;
let reservaOcupada: Promise<void>;
let sinalizarEspera: () => void;
let falharLock = false;
let sequencia = 0;

function query(tabela: string) {
  const filtros: ((row: Row) => boolean)[] = [];
  let patch: Row | null = null;
  let insercao: Row | null = null;
  let limite = Infinity;
  const executar = () => {
    const rows = bd[tabela] ?? (bd[tabela] = []);
    if (insercao) rows.push({ id: `msg-${++sequencia}`, ...insercao });
    const encontrados = rows.filter((r) => filtros.every((f) => f(r))).slice(0, limite);
    if (patch) encontrados.forEach((r) => Object.assign(r, patch));
    return { data: encontrados.map((r) => ({ ...r })), count: encontrados.length, error: null };
  };
  const api: any = {
    select: () => api,
    insert: (row: Row) => ((insercao = row), api),
    update: (row: Row) => ((patch = row), api),
    eq: (k: string, v: any) => (filtros.push((r) => r[k] === v), api),
    is: (k: string, v: any) => (filtros.push((r) => r[k] === v), api),
    in: (k: string, v: any[]) => (filtros.push((r) => v.includes(r[k])), api),
    like: (k: string, v: string) => (filtros.push((r) => String(r[k]).startsWith(v.replace(/%$/, ""))), api),
    order: () => api,
    limit: (n: number) => ((limite = n), api),
    maybeSingle: async () => { const r = executar(); return { ...r, data: r.data[0] ?? null }; },
    then: (res: any, rej: any) => Promise.resolve(executar()).then(res, rej),
  };
  return api;
}

const admin = {
  from: query,
  rpc: async (nome: string, args: Row) => {
    if (nome === "nina_lock_adquirir") {
      if (falharLock) return { data: null, error: { message: "offline" } };
      if (reservas.has(args._chave)) {
        sinalizarEspera();
        return { data: null, error: null };
      }
      const token = `token-${++sequencia}`;
      reservas.set(args._chave, token);
      return { data: token, error: null };
    }
    if (nome === "nina_lock_liberar") {
      if (reservas.get(args._chave) === args._token) reservas.delete(args._chave);
      return { data: true, error: null };
    }
    if (nome === "nina_lock_renovar") return { data: reservas.get(args._chave) === args._token, error: null };
    if (nome === "nina_revisao_registrar_entrada") return { data: 1, error: null };
    if (nome === "nina_teste_garantir_ciclo") {
      const lead = bd.nina_teste_leads.find((l) => l.id === args.p_lead_id)!;
      const conversaId = `conv-${lead.id}-${lead.sessao_seq}`;
      lead.conversa_id = conversaId;
      lead.ciclo_id = `ciclo-${lead.id}-${lead.sessao_seq}`;
      bd.atend_conversas.push({ id: conversaId, clinica_id: "clinica", is_teste: true, contato_telefone: lead.telefone_sessao });
      return { data: { conversa_id: conversaId, ciclo_id: lead.ciclo_id, criado: true }, error: null };
    }
    throw new Error(`RPC não simulada: ${nome}`);
  },
};
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: admin }));
mock.module("@/lib/nina/revisao-conversa.server", () => ({ incrementarRevisaoConversa: async () => 1 }));
mock.module("@/lib/atendimento/handoff.server", () => ({
  registrarMarcadorSistema: async () => {},
  registrarEvento: async (e: Row) => {
    bd.eventos.push(e);
    if (e.evento === "FINALIZADA") { eventoIniciado(); await continuar; }
  },
}));
// A prova termina na persistência da entrada: nenhuma inferência ou reserva real.
mock.module("@/lib/nina-desligada.server", () => ({ ninaDesativadaNaClinica: async () => true }));

const { resetarLeadTeste, processarMensagemTeste } = await import("@/lib/nina/teste-console.server");
const { comSessaoTesteExclusiva } = await import("@/lib/nina/sessao-teste-exclusiva.server");

beforeEach(() => {
  reservas = new Map();
  falharLock = false;
  iniciou = new Promise((r) => { eventoIniciado = r; });
  continuar = new Promise((r) => { continuarReset = r; });
  reservaOcupada = new Promise((r) => { sinalizarEspera = r; });
  bd = { nina_teste_leads: [], atend_conversas: [], nina_teste_ciclos: [], whatsapp_mensagens: [], nina_message_batches: [], nina_conversa_locks: [], eventos: [] };
  for (const i of [1, 2]) {
    bd.nina_teste_leads.push({ id: `lead${i}`, clinica_id: "clinica", indice: i, nome: `Teste ${i}`, sessao_seq: 42, telefone_sessao: `55000${i}00042`, conversa_id: `antiga${i}`, ciclo_id: `ciclo${i}`, status: "ativa" });
    bd.atend_conversas.push({ id: `antiga${i}`, clinica_id: "clinica", is_teste: true, contato_telefone: `55000${i}00042`, status: "bot_attending" });
    bd.nina_teste_ciclos.push({ id: `ciclo${i}`, clinica_id: "clinica", status: "ativo" });
  }
});

const reset = () => resetarLeadTeste(admin, { clinicaId: "clinica", leadId: "lead2", conversaId: "antiga2", userId: "operador", manual: true });
const enviar = (leadId = "lead2") => processarMensagemTeste({ clinicaId: "clinica", leadId, texto: "boa noite", tipo: "text", chave: "envio-regressao" }, "operador");

it("mensagem durante o reset aguarda e usa conversa e telefone NOVOS", async () => {
  const reinicio = reset();
  await iniciou;
  const mensagem = enviar();
  await reservaOcupada;
  expect(bd.whatsapp_mensagens).toHaveLength(0);
  continuarReset();
  await reinicio;
  await mensagem;
  expect(bd.whatsapp_mensagens).toHaveLength(1);
  expect(bd.whatsapp_mensagens[0]).toMatchObject({ conversa_id: "conv-lead2-43", from_number: "55000200043", body: "boa noite" });
  expect(reservas.size).toBe(0);
});

it("reset do lead 02 não bloqueia a entrada do lead 01", async () => {
  const reinicio = reset();
  await iniciou;
  await enviar("lead1");
  expect(bd.whatsapp_mensagens[0].conversa_id).toBe("antiga1");
  continuarReset();
  await reinicio;
});

it("dois resets simultâneos avançam a sessão uma única vez", async () => {
  const primeiro = reset();
  await iniciou;
  const segundo = reset();
  await reservaOcupada;
  continuarReset();
  await primeiro;
  expect((await segundo).jaResolvida).toBe(true);
  expect(bd.nina_teste_leads[1].sessao_seq).toBe(43);
  expect(bd.eventos.filter((e) => e.evento === "IA_MEMORIA_RESETADA")).toHaveLength(1);
});

it("falha da operação libera a reserva para a próxima tentativa", async () => {
  await expect(comSessaoTesteExclusiva({ clinicaId: "clinica", leadId: "lead2" }, async () => { throw new Error("falha"); })).rejects.toThrow("falha");
  expect(reservas.size).toBe(0);
  expect(await comSessaoTesteExclusiva({ clinicaId: "clinica", leadId: "lead2" }, async () => "ok")).toBe("ok");
});

it("falha da reserva impede gravação na sessão antiga e informa o motivo", async () => {
  falharLock = true;
  await expect(enviar()).rejects.toThrow("sessão de teste está ocupada");
  expect(bd.whatsapp_mensagens).toHaveLength(0);
});
