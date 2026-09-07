import { describe, expect, it } from "vitest";
import {
  classificarMotivoHandoff,
  contemTermoTecnico,
  destinoTexto,
  montarMensagemHandoffFallback,
  setorMencionavel,
  validarMensagemHandoff,
  type ContextoMensagemHandoff,
} from "../mensagem-handoff";

const casos: ContextoMensagemHandoff[] = [
  { protocolo: "MJ-14712", nome: "Felipe Souza", setor: "Recepção", motivo: "agendamento" },
  { protocolo: "MJ-14713", nome: null, setor: null, motivo: "informacao_indisponivel" },
  { protocolo: "MJ-14714", nome: "Ana", setor: "Financeiro", motivo: "financeiro", assunto: "o valor do exame" },
  { protocolo: "MJ-14715", nome: "Bruno", setor: "Ambulatório 3B", motivo: "pedido_do_paciente" },
];

describe("mensagem de handoff — conteúdo obrigatório", () => {
  it("todas as mensagens trazem o protocolo real e passam na validação", () => {
    for (const ctx of casos) {
      const texto = montarMensagemHandoffFallback(ctx);
      expect(texto).toContain(ctx.protocolo);
      expect(validarMensagemHandoff(texto, ctx)).toEqual({ ok: true, problemas: [] });
    }
  });

  it("mensagens de motivos diferentes não são idênticas", () => {
    const textos = new Set(casos.map((c) => montarMensagemHandoffFallback(c).replace(/MJ-\d+/, "")));
    expect(textos.size).toBeGreaterThanOrEqual(3);
  });

  it("nunca inventa setor: destino desconhecido vira 'nossa equipe'", () => {
    expect(setorMencionavel("Ambulatório 3B")).toBeNull();
    expect(destinoTexto("Ambulatório 3B")).toBe("nossa equipe");
    expect(destinoTexto("Recepção")).toBe("nossa equipe de Recepção");
    expect(montarMensagemHandoffFallback(casos[3]!)).not.toMatch(/Ambulatório/i);
  });

  it("rejeita texto que expõe detalhe técnico", () => {
    expect(contemTermoTecnico("a tool falhou")).toBe(true);
    const r = validarMensagemHandoff(
      "O catálogo está vazio, vou encaminhar para nossa equipe por aqui. Protocolo: MJ-1",
      { protocolo: "MJ-1" },
    );
    expect(r.ok).toBe(false);
    expect(r.problemas).toContain("expõe detalhe técnico");
  });

  it("rejeita texto sem protocolo, sem equipe ou com setor não estruturado", () => {
    expect(
      validarMensagemHandoff("Vou encaminhar para nossa equipe por aqui.", { protocolo: "MJ-9" }).problemas,
    ).toContain("protocolo ausente");
    expect(
      validarMensagemHandoff(
        "Vou encaminhar para nossa equipe de Financeiro por aqui. MJ-9",
        { protocolo: "MJ-9", setor: null },
      ).problemas,
    ).toContain("menciona setor não estruturado");
  });

  it("classifica motivos internos sem vazar linguagem técnica", () => {
    expect(classificarMotivoHandoff("paciente pediu remarcação")).toBe("agendamento");
    expect(classificarMotivoHandoff("dúvida sobre pagamento")).toBe("financeiro");
    expect(classificarMotivoHandoff("solicitar_atendente_humano")).toBe("pedido_do_paciente");
    expect(classificarMotivoHandoff("catálogo sem registro publicado")).toBe("informacao_indisponivel");
    expect(classificarMotivoHandoff(null)).toBe("indefinido");
  });
});
