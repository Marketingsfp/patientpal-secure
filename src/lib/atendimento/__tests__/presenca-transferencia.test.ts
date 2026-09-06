import { expect, test } from "bun:test";
import { statusPresenca, ROTULO_PRESENCA } from "../perfil-atendimento";
const agora = new Date().toISOString();
test("online", () => expect(statusPresenca({ status: "ONLINE", vistoEm: agora, emPausa: false })).toBe("ONLINE"));
test("pausa prevalece", () => expect(statusPresenca({ status: "ONLINE", vistoEm: agora, emPausa: true })).toBe("PAUSA"));
test("heartbeat velho = offline", () => expect(statusPresenca({ status: "ONLINE", vistoEm: "2020-01-01T00:00:00Z", emPausa: false })).toBe("OFFLINE"));
test("sem presenca", () => expect(statusPresenca({ status: null, vistoEm: null, emPausa: false })).toBe("OFFLINE"));
test("rotulos", () => expect(ROTULO_PRESENCA.PAUSA).toBe("Em pausa"));
