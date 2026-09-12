import { expect, test } from "bun:test";
import { statusPresenca, ROTULO_PRESENCA } from "../perfil-atendimento";
const agora = new Date().toISOString();
test("online", () => expect(statusPresenca({ status: "ONLINE", vistoEm: agora, emPausa: false })).toBe("ONLINE"));
test("pausa prevalece", () => expect(statusPresenca({ status: "ONLINE", vistoEm: agora, emPausa: true })).toBe("PAUSA"));
// FASE 2 — presença manual: heartbeat velho NÃO derruba a escolha do atendente.
test("heartbeat velho continua Online", () => expect(statusPresenca({ status: "ONLINE", vistoEm: "2020-01-01T00:00:00Z", emPausa: false })).toBe("ONLINE"));
test("sem presenca", () => expect(statusPresenca({ status: null, vistoEm: null, emPausa: false })).toBe("OFFLINE"));
test("rotulos", () => expect(ROTULO_PRESENCA.PAUSA).toBe("Em pausa"));
