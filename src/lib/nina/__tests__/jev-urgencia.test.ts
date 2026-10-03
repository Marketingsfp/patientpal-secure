import { describe, expect, test } from "bun:test";
import { decidirEncaminhamento, perguntasUrgencia } from "../jev-encaminhamento";
import { LIMITES_JEV_PADRAO } from "../jev-limites";

describe("Jev E1 — sinais de urgência", () => {
  test("4 perguntas e criança/idoso com idades definidas", () => {
    const p = perguntasUrgencia();
    expect(Object.keys(p)).toHaveLength(4);
    expect(String(p.urgencia_crianca_idoso.instructions)).toContain("12 anos");
    expect(String(p.urgencia_crianca_idoso.instructions)).toContain("60 anos");
  });
  test("sinal acima do limite transfere com urgência alta e nomeia o sinal", () => {
    const r = decidirEncaminhamento({ urgencia_gestante: { noul: 0.9 } }, null, LIMITES_JEV_PADRAO);
    expect(r?.urgencia).toBe("alta");
    expect(r?.motivo).toContain("gestante");
  });
  test("abaixo do limite ou sem resposta não transfere", () => {
    expect(decidirEncaminhamento({ urgencia_dor_ar: { noul: 0.2 } }, null, LIMITES_JEV_PADRAO)).toBeNull();
    expect(decidirEncaminhamento(null, null, LIMITES_JEV_PADRAO)).toBeNull();
  });
});
