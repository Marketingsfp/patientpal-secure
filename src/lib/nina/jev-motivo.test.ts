import { describe, expect, test } from "bun:test";
import { categoriaDoMotivo, decidirCategoria, motivoComCategoria, pesoCategoriaMotivo } from "./jev-motivo";
import { calcularAtencao } from "@/lib/atendimento/central-atencao";

describe("Jev Fase 8 — motivo da transferência", () => {
  test("códigos conhecidos já têm categoria", () => {
    expect(categoriaDoMotivo("JEV_URGENCIA_CLINICA: x")).toBe("urgencia_clinica");
    expect(categoriaDoMotivo("JEV_IRRITACAO: x")).toBe("insatisfacao");
    expect(categoriaDoMotivo("PROFISSIONAL_SFP")).toBe("outra_unidade");
    expect(categoriaDoMotivo("Paciente quer boleto")).toBeNull();
  });
  test("sem certeza ou erro = sem decisão, motivo intacto", () => {
    expect(decidirCategoria(undefined)).toBeNull();
    expect(decidirCategoria({ choice: "financeiro", probabilities: { financeiro: 0.4 } })).toBeNull();
    expect(decidirCategoria({ choice: "inventada", confidence: 0.99 })).toBeNull();
    expect(motivoComCategoria("Quer boleto", null)).toBe("Quer boleto");
  });
  test("categoria vira prefixo legível e é lida de volta", () => {
    const c = decidirCategoria({ choice: "financeiro", probabilities: { financeiro: 0.9 } });
    const m = motivoComCategoria("Quer boleto", c);
    expect(m).toBe("[Financeiro] Quer boleto");
    expect(categoriaDoMotivo(m)).toBe("financeiro");
    expect(motivoComCategoria("JEV_IRRITACAO: x", "financeiro")).toBe("JEV_IRRITACAO: x");
  });
  test("urgência e insatisfação sobem sem mudar a faixa de espera", () => {
    expect(pesoCategoriaMotivo("urgencia_clinica")).toBeLessThan(pesoCategoriaMotivo("insatisfacao"));
    const agora = Date.parse("2026-10-03T12:00:00Z");
    const r = calcularAtencao({
      naoAtribuidas: [
        { id: "a", handoff_motivo: "[Financeiro] x", owner_type: "HUMAN", status: "waiting" },
        { id: "b", handoff_motivo: "JEV_URGENCIA_CLINICA: y", owner_type: "HUMAN", status: "waiting" },
      ],
      espera: {},
      agora,
      limiteItens: 10,
    });
    if (r.itens.length === 2) expect(r.itens[0].id).toBe("b");
  });
});

import { decidirEncaminhamento, sinalUrgenciaAcima } from "./jev-encaminhamento";
describe("Etapa E1 — sinais de urgência separados", () => {
  const lim = { urgencia: 0.5, pedido_atendente: 0.7, irritacao: 0.8 };
  test("sinal acima do limite transfere com urgência alta e cita o sinal", () => {
    const e = decidirEncaminhamento({ urgencia_gestante: { noul: 0.9 }, urgencia_dor_ar: { noul: 0.6 } }, null, lim);
    expect(e?.urgencia).toBe("alta");
    expect(e?.motivo).toContain("gestante com queixa");
    expect(categoriaDoMotivo(e!.motivo)).toBe("urgencia_clinica");
  });
  test("abaixo do limite ou sem resposta não transfere", () => {
    expect(sinalUrgenciaAcima({ urgencia_dor_ar: { noul: 0.4 } }, {})).toBeNull();
    expect(decidirEncaminhamento({}, null, lim)).toBeNull();
    expect(sinalUrgenciaAcima({ urgencia_dor_ar: { noul: 0.6 } }, { urgencia_dor_ar: 0.7 })).toBeNull();
  });
});
