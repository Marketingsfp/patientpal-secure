import { mock } from "bun:test";
import assert from "node:assert/strict";
let limpezas = 0;
mock.module("@/lib/nina/espera-paciente.server", () => ({
  limparEsperaPaciente: async () => {
    limpezas++;
  },
}));
const { resolverConversaCore } = await import("../../resolver-conversa.server");
// Sem conversa lida (Nina e bloqueio de contato): igual a antes. Com ela
// (botão Encerrar, 17/10/2026): não relê a conversa nem limpa o prazo à parte.
for (const [actor, jaLida] of [
  ["admin", false],
  ["supervisor", false],
  ["admin", true],
  ["supervisor", true],
] as const) {
  let update: any = null,
    event: any = null,
    leituras = 0;
  limpezas = 0;
  const db = {
    from(table: string) {
      const q: any = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        async maybeSingle() {
          leituras++;
          return {
            data: {
              atribuida_user_id: "ana",
              last_assigned_user_id: "ana",
              nina_fluxo_estado: null,
              protocolo_atendimento: "MJ-1",
            },
          };
        },
        update(value: any) {
          update = value;
          return q;
        },
        async insert(value: any) {
          event = value;
          return { error: null };
        },
      };
      return q;
    },
    async rpc() {
      return { data: null, error: null };
    },
  };
  await resolverConversaCore(db, {
    clinicaId: "clinica",
    conversaId: "conversa",
    userId: actor,
    adiarResumo: true,
    ...(jaLida
      ? {
          conversaLida: {
            atribuida_user_id: "ana",
            last_assigned_user_id: "ana",
            nina_fluxo_estado: null,
            protocolo_atendimento: "MJ-1",
          },
        }
      : {}),
  });
  assert.equal(leituras, jaLida ? 0 : 1);
  assert.equal(limpezas, jaLida ? 0 : 1);
  // O prazo de espera continua zerado pela própria atualização.
  assert.equal(update.awaiting_patient_since, null);
  assert.equal(update.patient_response_deadline, null);
  assert.equal(update.status, "closed");
  assert.equal(event.detalhes.protocolo, "MJ-1");
  assert.equal(update.resolved_by, actor);
  assert.equal(update.last_assigned_user_id, "ana");
  assert.equal(update.atribuida_user_id, null);
  assert.equal(event.user_id, actor);
  assert.equal(event.detalhes.resolvido_por, actor);
  assert.equal(event.detalhes.ultimo_atendente, "ana");
  assert.equal(event.detalhes.automatico, false);
}
console.log("Autoria do encerramento validada com banco simulado.");
