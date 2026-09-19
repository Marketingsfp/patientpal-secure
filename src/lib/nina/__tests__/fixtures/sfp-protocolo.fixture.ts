/** Protocolo real, inclusive atribuição posterior/retry; banco e geração externos simulados. */
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
      assert.equal(tabela, "atend_conversas");
      const filtros: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (campo: string, valor: unknown) => { filtros[campo] = valor; return q; },
        maybeSingle: async () => {
          assert.deepEqual(filtros, { id: "conversa", clinica_id: "clinica" });
          return { error: null, data: {
            handoff_em: "2026-09-19T12:00:00Z", handoff_motivo: motivo,
            nina_fluxo_estado: { session_id: "sessao" },
            is_teste: teste, departamento_id: null, contato_nome: "Paciente fictício",
          } };
        },
      };
      return q;
    },
    rpc: async (nome: string, args: Record<string, unknown>) => {
      assert.equal(nome, "atend_gerar_protocolo_atendimento");
      assert.equal(args._clinica_id, "clinica");
      assert.equal(args._conversa_id, "conversa");
      return { error: null, data: [{ protocolo: "TESTE-1", novo: false }] };
    },
  },
}));
mock.module("@/lib/atendimento/mensagem-handoff.server", () => ({
  gerarMensagemHandoff: async () => { geracoes++; throw new Error("SFP não deve gerar aviso"); },
}));
const { protocoloAoIniciarHandoff, protocoloAoAtribuirHumano, anunciarHandoffAoPaciente, prepararAvisoHandoff } =
  await import("@/lib/atendimento/protocolo-atendimento.server");
const args = { clinicaId: "clinica", conversaId: "conversa", protocolo: "TESTE-1" };
let cenarios = 0;
for (teste of [false, true]) {
  for (motivo of ["PROFISSIONAL_SFP: atendimento exclusivo da equipe humana",
    "Profissional SFP exige atendimento humano para Anestesia da Videohisteroscopia"]) {
    const inicial = await protocoloAoIniciarHandoff(args);
    assert.equal(inicial?.protocolo, "TESTE-1");
    assert.equal(inicial?.anuncio?.informado, false);
    assert.equal(inicial?.anuncio?.mensagemId, null);
    const atribuicao = await protocoloAoAtribuirHumano({ ...args, userId: "atendente" });
    assert.equal(atribuicao?.protocolo, "TESTE-1");
    assert.equal(await prepararAvisoHandoff(args), null);
    for (let i = 0; i < 2; i++) {
      const retry = await anunciarHandoffAoPaciente(args);
      assert.equal(retry.informado, false);
      assert.equal(retry.transporte, "nenhum");
      assert.equal(retry.mensagemTexto, null);
      assert.equal(retry.aviso, null);
    }
    cenarios++;
  }
}
assert.equal(geracoes, 0);
assert.equal(rede, 0);
console.log(`SFP_PROTOCOLO_OK: ${cenarios} cenários sem geração nem envio`);
