import { describe, expect, it } from "bun:test";
import {
  contratoEmDia,
  escolherCartaoDaFamilia,
  type CandidatoFamilia,
} from "./cartao-da-familia";

const HOJE = "2026-09-05";

const candidato = (
  contratoId: string,
  vencimentos: string[],
  extra: Partial<CandidatoFamilia> = {},
): CandidatoFamilia => ({
  contratoId,
  numero: 1,
  titularNome: "JOSE AILTON SOARES DE PAIVA",
  convenioNome: "CARTÃO CONSULTA + SEGUROS",
  parcelasEmAberto: vencimentos.map((vencimento) => ({ vencimento })),
  ...extra,
});

describe("contratoEmDia", () => {
  it("contrato sem parcela em aberto está em dia", () => {
    expect(contratoEmDia([], HOJE)).toBe(true);
  });

  it("parcela ainda a vencer não bloqueia", () => {
    // Caso real do contrato ac215699: próxima parcela em 25/09.
    expect(contratoEmDia([{ vencimento: "2026-09-25" }], HOJE)).toBe(true);
  });

  it("parcela vencida dentro da tolerância de 5 dias não bloqueia", () => {
    expect(contratoEmDia([{ vencimento: "2026-08-31" }], HOJE)).toBe(true);
  });

  it("parcela vencida há mais de 5 dias bloqueia", () => {
    // 23/08 é o vencimento do contrato duplicado que fez a cobrança sair cheia.
    expect(contratoEmDia([{ vencimento: "2026-08-23" }], HOJE)).toBe(false);
  });

  it("basta uma parcela atrasada no meio de várias em dia", () => {
    expect(
      contratoEmDia(
        [{ vencimento: "2026-09-25" }, { vencimento: "2026-07-23" }, { vencimento: "2026-10-25" }],
        HOJE,
      ),
    ).toBe(false);
  });

  it("compara como texto, sem passar pelo fuso UTC", () => {
    // new Date("2026-08-31") volta como 30/08 no Brasil; se a comparação
    // passasse por Date, o corte andaria um dia e a tolerância viraria 4.
    expect(contratoEmDia([{ vencimento: "2026-08-31T00:00:00-03:00" }], HOJE)).toBe(true);
  });
});

describe("escolherCartaoDaFamilia", () => {
  it("não sugere nada quando não há candidato", () => {
    expect(escolherCartaoDaFamilia([], HOJE)).toBeNull();
  });

  it("não sugere cartão da família que também está em atraso", () => {
    // Família inteira devendo: o valor cheio é o certo para todo mundo e o
    // aviso só atrapalharia a recepção.
    const achado = escolherCartaoDaFamilia([candidato("c1", ["2026-06-23", "2026-07-23"])], HOJE);
    expect(achado).toBeNull();
  });

  it("sugere o cartão da família que está em dia", () => {
    const achado = escolherCartaoDaFamilia([candidato("c1", ["2026-09-25"])], HOJE);
    expect(achado?.contratoId).toBe("c1");
    expect(achado?.titularNome).toBe("JOSE AILTON SOARES DE PAIVA");
    expect(achado?.convenioNome).toBe("CARTÃO CONSULTA + SEGUROS");
  });

  it("ignora o contrato em atraso e fica com o que está pago", () => {
    const achado = escolherCartaoDaFamilia(
      [
        candidato("atrasado", ["2026-07-23"]),
        candidato("pago", ["2026-09-25"], { titularNome: "CELIANE DAMIAO ROCHA DE PAIVA" }),
      ],
      HOJE,
    );
    expect(achado?.contratoId).toBe("pago");
    expect(achado?.titularNome).toBe("CELIANE DAMIAO ROCHA DE PAIVA");
  });

  it("não devolve as parcelas junto — a tela só precisa do cartão", () => {
    const achado = escolherCartaoDaFamilia([candidato("c1", [])], HOJE);
    expect(achado).not.toBeNull();
    expect(achado as unknown as Record<string, unknown>).not.toHaveProperty("parcelasEmAberto");
  });
});
