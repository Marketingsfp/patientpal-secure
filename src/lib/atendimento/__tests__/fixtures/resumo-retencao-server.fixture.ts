import { expect, mock } from "bun:test";
import { normalizarResumo } from "../../handoff-resumo";

const now = Date.now();
const iso = (delta: number) => new Date(now + delta).toISOString();
const day = 86400000;
const cenario = process.argv[2];
let inicio = iso(-3600000);
let rows: any[] = [
  {
    id: "r1",
    clinica_id: "c1",
    conversa_id: "v1",
    versao: 1,
    handoff_em: iso(-1800000),
    atendimento_inicio: inicio,
    situacao: "active",
    status: "gerando",
    desfecho: "handoff_humano",
    payload: null,
    updated_at: iso(-1800000),
  },
];
const conv: any = { id: "v1", clinica_id: "c1", handoff_em: rows[0].handoff_em, status: "waiting" };
let chamadas = 0;
let reservas = 0;
let eventos = 0;
const agendamentos = [
  {
    id: "a1",
    clinica_id: "c1",
    paciente_id: "p1",
    status: "agendado",
    inicio: iso(day),
    created_at: iso(-10 * day),
    procedimento: "Ortopedia",
    medicos: { nome: "Médico de teste" },
  },
];
const msgs = [
  {
    body: "SEGREDO DO ATENDIMENTO ANTERIOR",
    created_at: iso(-2 * day),
    recebida_em: iso(-2 * day),
  },
  {
    body: "Gostaria de marcar ortopedia",
    created_at: iso(-3000000),
    recebida_em: iso(-3000000),
    direction: "in",
  },
];
function from(table: string) {
  const filters: ((r: any) => boolean)[] = [];
  let patch: any = null,
    single = false;
  const q: any = {
    in(k: string, values: unknown[]) {
      filters.push((r) => values.includes(r[k]));
      return q;
    },
    lt(k: string, v: string) {
      filters.push((r) => Date.parse(r[k]) < Date.parse(v));
      return q;
    },
    lte(k: string, v: string) {
      filters.push((r) => Date.parse(r[k]) <= Date.parse(v));
      return q;
    },
    select() {
      return q;
    },
    eq(k: string, v: any) {
      filters.push((r) => r[k] === v);
      return q;
    },
    gt(k: string, v: string) {
      filters.push((r) => Date.parse(r[k]) > Date.parse(v));
      return q;
    },
    gte(k: string, v: string) {
      filters.push((r) => Date.parse(r[k]) >= Date.parse(v));
      return q;
    },
    order() {
      return q;
    },
    limit() {
      return q;
    },
    maybeSingle() {
      single = true;
      return q;
    },
    update(p: any) {
      patch = p;
      return q;
    },
    then(ok: any, err: any) {
      return Promise.resolve()
        .then(() => {
          const source =
            table === "atend_handoff_resumos"
              ? rows
              : table === "atend_conversas"
                ? [conv]
                : table === "whatsapp_mensagens"
                  ? msgs.map((m) => ({ ...m, clinica_id: "c1", conversa_id: "v1" }))
                  : table === "agendamentos"
                    ? agendamentos
                    : [];
          const match = source.filter((r) => filters.every((f) => f(r)));
          if (patch) match.forEach((r) => Object.assign(r, patch));
          return { data: structuredClone(single ? (match[0] ?? null) : match), error: null };
        })
        .then(ok, err);
    },
  };
  return q;
}
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from,
    rpc: async (fn: string) => {
      if (fn === "atend_reservar_resumo") {
        reservas++;
        return { data: null, error: null };
      }
      return { data: inicio, error: null };
    },
  },
}));
mock.module("../../handoff.server", () => ({
  registrarEvento: async () => {
    eventos++;
  },
}));
process.env.LOVABLE_API_KEY = "chave-ficticia-sem-rede";
globalThis.fetch = (async (_url: any, op: any) => {
  chamadas++;
  expect(op.body).not.toContain("SEGREDO DO ATENDIMENTO ANTERIOR");
  expect(op.body).toContain("Gostaria de marcar ortopedia");
  if (cenario === "expirou_durante_ia") rows = [];
  if (cenario === "resolveu_durante_ia") {
    rows[0].updated_at = iso(1);
    rows[0].desfecho = "conversa_resolvida";
    rows[0].status = "ok";
    rows[0].payload = normalizarResumo({ pendencias: [], proxima_acao: null });
  }
  if (cenario === "reabriu_durante_ia") {
    inicio = iso(1);
    rows[0].situacao = "archived";
  }
  return Response.json({
    choices: [
      {
        message: {
          content: JSON.stringify({ pendencias: ["IA antiga"], proxima_acao: "IA antiga" }),
        },
      },
    ],
  });
}) as typeof fetch;
if (cenario === "vaga_criada_antes") {
  conv.contato_paciente_id = "p1";
  conv.nina_fluxo_estado = { appointment: { appointment_id: "a1" } };
}
if (cenario === "entrada_antes_sessao") {
  // A abertura foi gravada antes da sessão; não pode sumir do resumo.
  msgs.splice(0, 1);
  msgs[0].created_at = msgs[0].recebida_em = iso(-3600001);
  msgs.push({
    id: "saida",
    body: "Olá, vou consultar a agenda",
    direction: "out",
    created_at: iso(-3500000),
    recebida_em: iso(-3500000),
  } as any);
}
if (cenario === "expirado") {
  conv.handoff_em = rows[0].handoff_em = iso(-8 * day);
  rows[0].updated_at = iso(0);
}
if (cenario === "outro_ciclo") rows[0].atendimento_inicio = iso(-2 * day);
const { garantirResumoHandoff, obterPainelResumo } = await import("../../handoff-resumo.server");
const r = await garantirResumoHandoff({ clinicaId: "c1", conversaId: "v1", forcar: true });
if (["expirado", "outro_ciclo", "expirou_durante_ia", "reabriu_durante_ia"].includes(cenario))
  expect(r).toBeNull();
if (cenario === "expirado") {
  expect(chamadas).toBe(0);
  expect(reservas).toBe(0);
}
if (cenario === "outro_ciclo") expect(chamadas).toBe(0);
if (cenario === "resolveu_durante_ia") {
  expect(r?.payload?.pendencias).toEqual([]);
  expect(r?.payload?.proxima_acao).toBeNull();
}
if (cenario === "vaga_criada_antes")
  expect(r?.payload?.agendamento_confirmado?.servico).toBe("Ortopedia");
if (cenario === "entrada_antes_sessao") expect(chamadas).toBe(1);
if (cenario === "normal") {
  expect(chamadas).toBe(1);
  expect(eventos).toBe(1);
  expect(r?.payload?.pendencias).toEqual(["IA antiga"]);
  await obterPainelResumo({ clinicaId: "c1", conversaId: "v1" });
  expect(chamadas).toBe(1);
}
if (!["normal", "vaga_criada_antes", "entrada_antes_sessao"].includes(cenario))
  expect(eventos).toBe(0);
console.log("RESUMO_SERVIDOR_OK", cenario);
