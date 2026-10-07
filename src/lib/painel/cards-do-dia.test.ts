import { describe, expect, it } from "bun:test";
import { ehBloqueio, separarPorCartao, somarPorAtendente } from "./cards-do-dia";

const f = (status: string, fluxo_etapa: string | null) => ({ status, fluxo_etapa });

describe("separarPorCartao", () => {
  const ags = [
    f("agendado", null),
    f("agendado", "aguardando_recepcao"),
    f("confirmado", "recepcao"),
    f("confirmado", "triagem"),
    f("em_atendimento", "atendimento"),
    f("realizado", "finalizado"),
    f("realizado", null),
  ];
  const c = separarPorCartao(ags);

  it("cada cartão recebe as fichas da sua regra", () => {
    expect(c.agendados).toHaveLength(7);
    expect(c.aguardando).toHaveLength(3);
    expect(c.checkins).toHaveLength(4);
    expect(c.naFila).toHaveLength(2);
    expect(c.emAtend).toHaveLength(1);
    expect(c.concluidos).toHaveLength(2);
  });

  it("aguardando + check-ins fecha com o total de agendados", () => {
    expect(c.aguardando.length + c.checkins.length).toBe(c.agendados.length);
  });
});

describe("ehBloqueio", () => {
  it("reconhece BLOQUEIO sem paciente vinculado, com ou sem acento e caixa", () => {
    expect(ehBloqueio({ paciente_nome: " bloqueio " })).toBe(true);
    expect(ehBloqueio({ paciente_nome: "BLOQUEIO", paciente_id: "p1" })).toBe(false);
    expect(ehBloqueio({ paciente_nome: "BLOQUÉIO" })).toBe(true);
    expect(ehBloqueio({ paciente_nome: "MARIA" })).toBe(false);
    expect(ehBloqueio({ paciente_nome: "0300" })).toBe(false);
  });
});

describe("somarPorAtendente", () => {
  it("soma a mesma atendente vinda de unidades diferentes", () => {
    const r = somarPorAtendente([
      [
        { usuario_id: "u1", usuario_nome: "ANA", qtd: 10 },
        { usuario_id: null, usuario_nome: "Sistema", qtd: 2 },
      ],
      [
        { usuario_id: "u1", usuario_nome: "ANA", qtd: 5 },
        { usuario_id: null, usuario_nome: "sistema", qtd: 1 },
      ],
    ]);
    expect(r.find((l) => l.usuario_id === "u1")?.qtd).toBe(15);
    expect(r.filter((l) => l.usuario_id === null)).toHaveLength(1);
    expect(r.find((l) => l.usuario_id === null)?.qtd).toBe(3);
  });
});
