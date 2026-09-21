import assert from "node:assert/strict";
import { mock } from "bun:test";
import { CLINICAS_GRUPO } from "../../clinicas-grupo";
import { estadoVazio } from "../../fluxo-estado-normalizar";
import type { CtxNinaPaciente } from "../../paciente-tools.server";

let rede = 0;
globalThis.fetch = (async () => {
  rede++;
  throw new Error("Rede proibida neste teste");
}) as unknown as typeof fetch;
const auditoria: unknown[] = [];
const calendariosLidos: string[] = [];
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from(tabela: string) {
      assert.equal(tabela, "audit_log", "Só auditoria é escrita; nunca dados de pacientes/agenda");
      return {
        insert: async (linha: unknown) => {
          auditoria.push(linha);
          return { error: null };
        },
      };
    },
  },
}));
mock.module("../../classificador-periodo.functions", () => ({
  carregarCalendariosPublicadosCache: async (_db: unknown, clinica: string) => {
    calendariosLidos.push(clinica);
    return [];
  },
}));
const { executarFerramentaPaciente, FERRAMENTAS_NINA_CONSULTA } =
  await import("../../paciente-tools.server");
for (const teste of [false, true]) {
  const ctx: CtxNinaPaciente = {
    clinicaId: CLINICAS_GRUPO[0].id,
    conversaId: "conversa-simulada",
    telefone: null,
    pacienteId: null,
    pacienteNome: null,
    origem: teste ? "homologacao" : "whatsapp",
    teste,
    podeAgendar: false,
    estado: estadoVazio(),
  };
  const antes = structuredClone(ctx);
  for (const c of CLINICAS_GRUPO) {
    const r = await executarFerramentaPaciente(ctx, "dados_da_clinica", { clinica: c.chave });
    assert.equal(r.ok, true);
    assert.match(JSON.stringify(r), new RegExp(c.telefone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.deepEqual(ctx, antes);
    const h = await executarFerramentaPaciente(ctx, "horario_funcionamento", { clinica: c.chave });
    assert.equal(h.ok, true);
    assert.ok(JSON.stringify(h).includes(c.nome));
    assert.deepEqual(ctx, antes);
  }
  const antesLeituras = calendariosLidos.length;
  const indefinida = await executarFerramentaPaciente(ctx, "horario_funcionamento", {
    clinica: "filial",
  });
  assert.equal(indefinida.encontrado, false);
  assert.equal(calendariosLidos.length, antesLeituras);
  const todas = await executarFerramentaPaciente(ctx, "dados_da_clinica", { clinica: "todas" });
  assert.equal((todas.clinicas as unknown[]).length, 3);
  assert.deepEqual(ctx, antes);
}
for (const nome of ["dados_da_clinica", "horario_funcionamento"]) {
  const tool = FERRAMENTAS_NINA_CONSULTA.find((t) => t.function.name === nome)!;
  assert.ok("clinica" in tool.function.parameters.properties);
}
assert.deepEqual(calendariosLidos, [
  ...CLINICAS_GRUPO.map((c) => c.id),
  ...CLINICAS_GRUPO.map((c) => c.id),
]);
assert.equal(rede, 0);
assert.equal(auditoria.length, 16);
console.log(
  "PASS: WhatsApp e homologação, diretório do grupo, contexto preservado, só calendário público e auditoria, sem rede.",
);
