import { describe, expect, it } from "bun:test";
import {
  montarRelatorioProdutividade,
  USUARIO_SISTEMA,
  type LinhaAgendamentosUsuario,
} from "./agendamentos-por-usuario";

const linha = (
  id: string | null,
  nome: string | null,
  m: number,
  co: number,
  ca: number,
  r: number,
): LinhaAgendamentosUsuario => ({
  usuario_id: id,
  usuario_nome: nome,
  marcados: m,
  confirmados: co,
  cancelados: ca,
  remarcados: r,
});

describe("montarRelatorioProdutividade", () => {
  it("soma as quatro ações no total da linha e nos totais gerais", () => {
    const r = montarRelatorioProdutividade([
      linha("u1", "NICOLE", 10, 5, 1, 2),
      linha("u2", "SUELLEN", 3, 0, 0, 1),
    ]);
    expect(r.linhas[0]).toMatchObject({ nome: "NICOLE", total: 18 });
    expect(r.totais).toEqual({
      marcados: 13,
      confirmados: 5,
      cancelados: 1,
      remarcados: 3,
      total: 22,
    });
  });

  it("ordena pelo total e desempata pelo nome", () => {
    const r = montarRelatorioProdutividade([
      linha("u1", "ZENILDA", 2, 0, 0, 0),
      linha("u2", "AMANDA", 1, 1, 0, 0),
      linha("u3", "NICOLE", 9, 0, 0, 0),
    ]);
    expect(r.linhas.map((l) => l.nome)).toEqual(["NICOLE", "AMANDA", "ZENILDA"]);
  });

  it("linha sem usuário vira 'Sistema', vai para o fim e soma no total", () => {
    const r = montarRelatorioProdutividade([
      linha(null, null, 100, 0, 50, 0),
      linha("u1", "NICOLE", 1, 0, 0, 0),
    ]);
    expect(r.linhas.map((l) => l.nome)).toEqual(["NICOLE", "Sistema"]);
    expect(r.linhas[1].ehSistema).toBe(true);
    expect(r.totais.total).toBe(151);
  });

  it("filtro por usuário mantém só a linha escolhida, inclusive a do sistema", () => {
    const cruas = [linha("u1", "NICOLE", 1, 2, 3, 4), linha(null, "Sistema", 5, 0, 0, 0)];
    expect(montarRelatorioProdutividade(cruas, "u1").linhas.map((l) => l.nome)).toEqual(["NICOLE"]);
    const so = montarRelatorioProdutividade(cruas, USUARIO_SISTEMA);
    expect(so.linhas.map((l) => l.nome)).toEqual(["Sistema"]);
    expect(so.totais.total).toBe(5);
  });

  it("aceita números vindos como texto (bigint do banco)", () => {
    const r = montarRelatorioProdutividade([
      { ...linha("u1", "A", 0, 0, 0, 0), marcados: "7" as unknown as number },
    ]);
    expect(r.linhas[0].marcados).toBe(7);
  });
});
