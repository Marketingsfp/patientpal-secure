/**
 * Decisão de 02/10/2026: o encaminhamento SFP deixou de ser silencioso.
 * O aviso de transferência com protocolo é preparado como em qualquer outro
 * encaminhamento. Banco e geração externos simulados; rede proibida.
 */
import { strict as assert } from "node:assert";
import { mock } from "bun:test";

let motivo = "PROFISSIONAL_SFP: atendimento exclusivo da equipe humana";
let teste = false;
let geracoes = 0;
let rede = 0;
globalThis.fetch = Object.assign(async () => {
  rede++;
  throw new Error("Rede proibida nesta simulação");
}, { preconnect: () => {} });
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from(tabela: string) {
      const q: Record<string, unknown> = {};
      const dados = tabela === "atend_conversas"
        ? { handoff_em: "2026-10-02T12:00:00Z", handoff_motivo: motivo,
            nina_fluxo_estado: { session_id: "sessao" }, protocolo_atendimento: "TESTE-1",
            is_teste: teste, departamento_id: null, contato_nome: "Paciente fictício" }
        : null;
      for (const m of ["select", "eq", "order", "limit", "in", "is", "not", "gte"]) q[m] = () => q;
      q.maybeSingle = async () => ({ error: null, data: dados });
      q.then = (ok: (v: unknown) => unknown) => ok({ error: null, data: [] });
      return q;
    },
    rpc: async () => ({ error: null, data: [{ protocolo: "TESTE-1", novo: false }] }),
  },
}));
mock.module("@/lib/nina/identidade-efetiva.server", () => ({
  identidadeEfetivaAtual: async () => null,
  identidadeParaMensagens: () => null,
}));
mock.module("@/lib/atendimento/mensagem-handoff.server", () => ({
  gerarMensagemHandoff: async (a: { protocolo: string }) => {
    geracoes++;
    return { texto: `Transferi para a equipe. Protocolo ${a.protocolo}.`, origem: "contingencia" };
  },
}));
const { prepararAvisoHandoff } = await import("@/lib/atendimento/protocolo-atendimento.server");
const args = { clinicaId: "clinica", conversaId: "conversa", protocolo: "TESTE-1" };
let cenarios = 0;
for (teste of [false, true]) {
  for (motivo of ["PROFISSIONAL_SFP: atendimento exclusivo da equipe humana",
    "Profissional SFP exige atendimento humano para Anestesia da Videohisteroscopia"]) {
    const aviso = await prepararAvisoHandoff(args);
    assert.ok(aviso, "SFP agora prepara aviso de transferência");
    assert.match(aviso.texto, /TESTE-1/);
    cenarios++;
  }
}
assert.equal(geracoes, cenarios);
assert.equal(rede, 0);
console.log(`SFP_PROTOCOLO_OK: ${cenarios} cenários com aviso e protocolo`);
