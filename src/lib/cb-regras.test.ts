import { describe, expect, it } from "bun:test";
import {
  classificarParcelaDoMes,
  DIAS_TOLERANCIA_MENSALIDADE,
  type SituacaoParcelaMes,
} from "./cb-regras";

/**
 * Regra dos indicadores do topo da tela de Vendas. Vale dinheiro: se a
 * classificação escorregar um dia, o card de inadimplentes passa a acusar
 * paciente que está em dia — ou deixa de acusar quem já perdeu o benefício.
 */

const HOJE = "2026-08-28";

/** Data ISO N dias antes de hoje, para escrever os casos por "dias de atraso". */
function diasAtras(n: number): string {
  const d = new Date(HOJE + "T00:00:00");
  d.setDate(d.getDate() - n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const classificar = (status: string | null, vencimento: string): SituacaoParcelaMes =>
  classificarParcelaDoMes(status, vencimento, HOJE);

describe("classificarParcelaDoMes — status", () => {
  it("parcela paga é paga, mesmo vencida há muito tempo", () => {
    expect(classificar("pago", diasAtras(90))).toBe("paga");
  });

  it("parcela cancelada é cancelada e não entra em nenhum indicador", () => {
    expect(classificar("cancelado", diasAtras(90))).toBe("cancelada");
  });

  it("não se confunde com maiúsculas", () => {
    expect(classificar("PAGO", diasAtras(30))).toBe("paga");
    expect(classificar("Cancelado", diasAtras(30))).toBe("cancelada");
  });

  it("status vazio ou desconhecido cai nos baldes em aberto", () => {
    // No banco existem parcelas com status legado "aberto" — elas têm de
    // continuar contando como em aberto, e não sumir da conta.
    expect(classificar("aberto", diasAtras(30))).toBe("inadimplente");
    expect(classificar("pendente", diasAtras(30))).toBe("inadimplente");
    expect(classificar(null, diasAtras(30))).toBe("inadimplente");
    expect(classificar("", diasAtras(1))).toBe("a_vencer");
  });
});

describe("classificarParcelaDoMes — a régua da tolerância", () => {
  it("parcela que ainda não venceu é a vencer", () => {
    expect(classificar("pendente", diasAtras(-3))).toBe("a_vencer");
  });

  it("parcela que vence hoje é a vencer", () => {
    expect(classificar("pendente", HOJE)).toBe("a_vencer");
  });

  it("dentro da tolerância continua em a vencer — o cartão ainda funciona", () => {
    for (let dia = 1; dia <= DIAS_TOLERANCIA_MENSALIDADE; dia += 1) {
      expect(classificar("pendente", diasAtras(dia))).toBe("a_vencer");
    }
  });

  it("no primeiro dia depois da tolerância vira inadimplente", () => {
    expect(classificar("pendente", diasAtras(DIAS_TOLERANCIA_MENSALIDADE + 1))).toBe(
      "inadimplente",
    );
  });

  it("a virada acontece entre o 5º e o 6º dia, e em nenhum outro ponto", () => {
    // Trava a fronteira exata: é o erro clássico de "off by one" nesta conta.
    expect(classificar("pendente", diasAtras(5))).toBe("a_vencer");
    expect(classificar("pendente", diasAtras(6))).toBe("inadimplente");
  });

  it("aceita uma tolerância diferente quando informada", () => {
    expect(classificarParcelaDoMes("pendente", diasAtras(3), HOJE, 0)).toBe("inadimplente");
    expect(classificarParcelaDoMes("pendente", diasAtras(3), HOJE, 10)).toBe("a_vencer");
  });
});

describe("classificarParcelaDoMes — datas", () => {
  it("não escorrega um dia por causa de fuso horário", () => {
    // `new Date("2026-08-01")` é lido como UTC e no Brasil volta como 31/07.
    // Se a função caísse nessa, a parcela do dia 1º seria classificada com a
    // data do dia anterior. Vale a virada de mês, que é onde isso apareceria.
    expect(classificarParcelaDoMes("pendente", "2026-08-01", "2026-08-06")).toBe("a_vencer");
    expect(classificarParcelaDoMes("pendente", "2026-08-01", "2026-08-07")).toBe("inadimplente");
  });

  it("aceita vencimento com hora junto", () => {
    expect(classificar("pendente", `${diasAtras(30)}T00:00:00`)).toBe("inadimplente");
  });

  it("atravessa a virada de mês sem erro", () => {
    // Hoje 03/09, parcela vencida em 30/08: 4 dias, ainda na tolerância.
    expect(classificarParcelaDoMes("pendente", "2026-08-30", "2026-09-03")).toBe("a_vencer");
    // Mesma parcela dois dias depois: 6 dias, já é inadimplência.
    expect(classificarParcelaDoMes("pendente", "2026-08-30", "2026-09-05")).toBe("inadimplente");
  });
});

describe("classificarParcelaDoMes — os baldes não se sobrepõem", () => {
  it("cada parcela cai em exatamente um indicador", () => {
    const casos: Array<[string | null, string]> = [
      ["pago", diasAtras(10)],
      ["cancelado", diasAtras(10)],
      ["pendente", diasAtras(10)],
      ["pendente", diasAtras(2)],
      ["pendente", diasAtras(-5)],
    ];
    const resultados = casos.map(([st, v]) => classificar(st, v));
    // Sem repetição de balde entre casos escolhidos de propósito distintos.
    expect(new Set(resultados).size).toBe(4);
    expect(resultados).toEqual(["paga", "cancelada", "inadimplente", "a_vencer", "a_vencer"]);
  });
});
