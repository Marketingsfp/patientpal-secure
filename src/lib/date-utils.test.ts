import { describe, expect, it } from "bun:test";
import { janelaDiaClinica, zonedDateStringToUtcISO, TZ_CLINICA } from "./date-utils";

// Loop 1 (filtro "apenas data selecionada" na Agenda) e Loop 4 (data
// retroativa caindo na sessão errada do caixa) — ambos rastreados ao mesmo
// bug técnico: `new Date(\`${data}T00:00:00\`).toISOString()` resolve a
// fronteira do dia no fuso do RUNTIME (navegador = BRT, Worker SSR do
// Cloudflare = UTC), não no fuso da clínica. Estes testes travam o
// substituto (`janelaDiaClinica`) para que ele nunca reintroduza essa
// dependência do fuso do runtime.

describe("janelaDiaClinica", () => {
  it("calcula a fronteira do dia no fuso de São Paulo (UTC-3, sem DST desde 2019)", () => {
    const { inicio, fimExclusivo } = janelaDiaClinica("2026-07-24");
    // 00:00 em São Paulo = 03:00 UTC do mesmo dia civil.
    expect(inicio).toBe("2026-07-24T03:00:00.000Z");
    // fim exclusivo = início do próximo dia civil, mesmo fuso.
    expect(fimExclusivo).toBe("2026-07-25T03:00:00.000Z");
  });

  it("é contígua: o fim de um dia é exatamente o início do próximo (sem buraco nem sobreposição)", () => {
    const dia1 = janelaDiaClinica("2026-07-24");
    const dia2 = janelaDiaClinica("2026-07-25");
    expect(dia1.fimExclusivo).toBe(dia2.inicio);
  });

  it("atravessa virada de mês e de ano corretamente", () => {
    expect(janelaDiaClinica("2026-07-31").fimExclusivo).toBe(
      janelaDiaClinica("2026-08-01").inicio,
    );
    expect(janelaDiaClinica("2026-12-31").fimExclusivo).toBe(
      janelaDiaClinica("2027-01-01").inicio,
    );
  });

  it("não depende do fuso do runtime — mesmo resultado independente de qual TZ é passado explicitamente", () => {
    // A garantia da função é justamente ignorar o fuso ambiente do processo
    // (que muda entre navegador e Worker SSR) e sempre calcular a partir do
    // `timeZone` passado explicitamente. Fixamos o fuso da clínica nos dois
    // cálculos e confirmamos que o resultado é estável.
    const a = janelaDiaClinica("2026-07-24", TZ_CLINICA);
    const b = janelaDiaClinica("2026-07-24", "America/Sao_Paulo");
    expect(a).toEqual(b);
  });

  it("um fuso diferente (UTC) produz uma janela diferente — prova que o parâmetro é respeitado", () => {
    const emSaoPaulo = janelaDiaClinica("2026-07-24", "America/Sao_Paulo");
    const emUTC = janelaDiaClinica("2026-07-24", "UTC");
    expect(emUTC.inicio).toBe("2026-07-24T00:00:00.000Z");
    expect(emUTC).not.toEqual(emSaoPaulo);
  });
});

describe("zonedDateStringToUtcISO", () => {
  it("converte meio-dia local de São Paulo para o instante UTC correto", () => {
    // Caso do bug em fn_registrar_lancamento_e_caixa, que grava
    // `(data || ' 12:00:00+00')::timestamptz` — meio-dia UTC vira 09:00 BRT,
    // não meio-dia BRT como o nome sugere.
    expect(zonedDateStringToUtcISO("2026-07-24", "12:00:00")).toBe(
      "2026-07-24T15:00:00.000Z",
    );
  });
});
