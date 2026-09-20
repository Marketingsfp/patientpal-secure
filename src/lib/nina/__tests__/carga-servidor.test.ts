import { expect, test } from "bun:test";
import { executarJobCarga } from "../carga-servidor.server";
import { EXECUTOR_CARGA_SERVIDOR } from "../carga-paralela";
import {
  criarBancoCargaSimulado,
  cargaFicticia,
  CLINICA_CARGA,
  RUN_CARGA,
  promessaControlada,
} from "./fixtures/carga-banco-simulado";

function ambiente(n = 2, turnos = 2) {
  const base = cargaFicticia();
  const db = criarBancoCargaSimulado([
    cargaFicticia({
      criado_por: "user",
      total_planejado: n * turnos,
      config: {
        ...(base.config as any),
        executor: EXECUTOR_CARGA_SERVIDOR,
        modoEnvio: "simultaneo",
        conversasSimultaneas: n,
        leadsAtivos: n,
        totalMensagens: n * turnos,
      },
      plano: Array.from({ length: n * turnos }, (_, indice) => ({
        ...base.plano[0],
        indice,
        leadId: `lead-${indice % n}`,
        leadIndice: (indice % n) + 1,
        mensagem: `mensagem-${indice}`,
      })),
      preflight: Array.from({ length: n }, (_, i) => ({
        ...base.preflight[0],
        leadId: `lead-${i}`,
      })),
    }),
  ]);
  db.tabelas.sistema_job_tokens = [{ nome: "nina-carga", token: "segredo-apenas-do-teste" }];
  db.tabelas.whatsapp_mensagens = [];
  const carga = () => db.tabelas.nina_teste_carga![0];
  type Tarefa = { cargaId: string; slot: number; token: string; assumida?: boolean };
  const fila: Tarefa[] = [],
    atuais = new Map<number, Tarefa>();
  const enfileirar = (slot: number) => {
    const j = { cargaId: RUN_CARGA, slot, token: crypto.randomUUID() };
    atuais.set(slot, j);
    fila.push(j);
    return j;
  };
  for (let i = 0; i < n; i++) enfileirar(i);
  let ativo = true,
    finais = 0,
    preparo = 0;
  db.admin.rpc = async (nome: string, args: any) => {
    const j = atuais.get(args?._slot);
    const valida = ativo && j?.token === args?._token && !carga().cancelar;
    if (nome === "nina_carga_servidor_assumir") {
      if (!valida || j!.assumida) return { data: null, error: null };
      j!.assumida = true;
      return { data: CLINICA_CARGA, error: null };
    }
    if (nome === "nina_carga_servidor_renovar") return { data: !!valida, error: null };
    if (nome === "nina_carga_servidor_finalizar") {
      finais++;
      if (
        j &&
        j.token === args._token &&
        carga().status === "executando" &&
        !carga().cancelar &&
        !args._falhou &&
        !args._aguardar_ms
      )
        enfileirar(j.slot);
      return { data: true, error: null };
    }
    throw new Error("RPC inesperada");
  };
  const entradas: any[] = [],
    liberacoes: Array<ReturnType<typeof promessaControlada<void>>> = [];
  const processar = async (d: any, userId: string) => {
    expect(userId).toBe("user");
    expect(d.clinicaId).toBe(CLINICA_CARGA);
    const gate = promessaControlada<void>();
    liberacoes.push(gate);
    entradas.push(d);
    const m = {
      id: d.chave,
      clinica_id: CLINICA_CARGA,
      conversa_id: `conversa-${d.leadId}`,
      direction: "in",
      is_teste: true,
      wa_message_id: `test-${d.leadId}-${d.chave}`,
      nina_status: "processing",
    };
    db.tabelas.whatsapp_mensagens!.push(m);
    await gate.promessa;
    m.nina_status = "completed";
    return { reply: "simulado", conversaId: m.conversa_id };
  };
  const executar = (j: Tarefa, segredo = "segredo-apenas-do-teste", extra = {}) =>
    executarJobCarga(
      new Request("https://example.invalid/api/public/nina/carga", {
        method: "POST",
        headers: { "x-job-token": segredo },
        body: JSON.stringify({ cargaId: j.cargaId, slot: j.slot, token: j.token, ...extra }),
      }),
      {
        admin: db.admin,
        processar,
        preparar: async () => {
          preparo++;
          return { status: "preparando" };
        },
      },
    );
  return {
    db,
    carga,
    fila,
    entradas,
    liberacoes,
    executar,
    desativar: () => {
      ativo = false;
    },
    finais: () => finais,
    preparo: () => preparo,
  };
}
async function ate(f: () => boolean) {
  for (let i = 0; i < 200 && !f(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(f()).toBe(true);
}

for (const n of [2, 5, 10])
  test(`servidor conclui ${n} pacientes sem controlador do navegador`, async () => {
    const a = ambiente(n);
    const chamadas: Promise<Response>[] = [];
    const iniciarFila = () => {
      while (a.fila.length) chamadas.push(a.executar(a.fila.shift()!));
    };
    iniciarFila();
    await ate(() => a.entradas.length === n);
    expect(new Set(a.entradas.map((e) => e.leadId)).size).toBe(n);
    a.liberacoes[0].resolver();
    await ate(() => a.fila.length > 0);
    iniciarFila();
    await ate(() => a.entradas.length === n + 1);
    expect(a.entradas[n].leadId).toBe(a.entradas[0].leadId);
    for (let i = 1; i < a.liberacoes.length; i++) a.liberacoes[i].resolver();
    for (let tentativa = 0; tentativa < 200 && a.carga().status !== "concluido"; tentativa++) {
      iniciarFila();
      for (const g of a.liberacoes) g.resolver();
      await new Promise((r) => setTimeout(r, 5));
    }
    iniciarFila();
    await Promise.all(chamadas);
    expect(a.carga().status).toBe("concluido");
    expect(a.entradas).toHaveLength(n * 2);
    expect(new Set(a.entradas.map((e) => e.chave)).size).toBe(n * 2);
    expect(a.carga().enviadas).toBe(n * 2);
  });
test("callback repetido e cancelamento não criam novas mensagens", async () => {
  const a = ambiente();
  const j = a.fila.shift()!;
  const p = a.executar(j);
  await ate(() => a.entradas.length === 1);
  expect(await (await a.executar(j)).json()).toEqual({ ignorada: true });
  a.carga().cancelar = true;
  a.carga().status = "parado";
  a.liberacoes[0].resolver();
  await p;
  expect(await (await a.executar(a.fila.shift()!)).json()).toEqual({ ignorada: true });
  expect(a.entradas).toHaveLength(1);
});
test("segredo inválido ou campos injetados não executam", async () => {
  const a = ambiente();
  const j = a.fila[0]!;
  expect((await a.executar(j, "outro-segredo")).status).toBe(401);
  expect(
    (await a.executar(j, undefined, { clinicaId: crypto.randomUUID(), texto: "injetado" })).status,
  ).toBe(400);
  expect(a.entradas).toHaveLength(0);
  expect(a.finais()).toBe(0);
});
test("configuração desativada impede o callback", async () => {
  const a = ambiente();
  a.desativar();
  expect(await (await a.executar(a.fila[0]!)).json()).toEqual({ ignorada: true });
  expect(a.entradas).toHaveLength(0);
});
test("preparação no servidor mantém o gate de mensagens fechado", async () => {
  const a = ambiente();
  a.carga().status = "preparando";
  expect((await a.executar(a.fila[0]!)).status).toBe(200);
  expect(a.preparo()).toBe(1);
  expect(a.entradas).toHaveLength(0);
  expect(a.finais()).toBe(1);
});
