import { describe, expect, it } from "bun:test";
import { ficouSemDesfecho, ultimoDiaEncerrado } from "./sem-desfecho";

// Último dia encerrado = 06/10 (antes das 19h de 07/10).
const ATE = "2026-10-06";
const f = (o: Partial<Parameters<typeof ficouSemDesfecho>[0]> = {}) => ({
  inicio: "2026-10-06T13:00:00Z",
  status: "agendado",
  fluxo_etapa: "aguardando_recepcao",
  paciente_nome: "MARIA",
  paciente_id: "p1",
  ...o,
});

describe("ultimoDiaEncerrado", () => {
  it("antes das 19h (São Paulo) é ontem; a partir das 19h é hoje", () => {
    expect(ultimoDiaEncerrado(new Date("2026-10-07T21:59:00Z"))).toBe("2026-10-06"); // 18:59
    expect(ultimoDiaEncerrado(new Date("2026-10-07T22:00:00Z"))).toBe("2026-10-07"); // 19:00
    expect(ultimoDiaEncerrado(new Date("2026-10-08T02:30:00Z"))).toBe("2026-10-07"); // 23:30
    expect(ultimoDiaEncerrado(new Date("2026-10-08T03:10:00Z"))).toBe("2026-10-07"); // 00:10
  });
});

describe("ficouSemDesfecho", () => {
  it("dia encerrado, agendado ou confirmado, sem check-in → sem desfecho", () => {
    expect(ficouSemDesfecho(f(), ATE)).toBe(true);
    expect(ficouSemDesfecho(f({ status: "confirmado" }), ATE)).toBe(true);
    expect(ficouSemDesfecho(f({ fluxo_etapa: null }), ATE)).toBe(true);
  });

  it("dia ainda aberto não conta: o paciente pode chegar até a clínica fechar", () => {
    expect(ficouSemDesfecho(f({ inicio: "2026-10-07T12:00:00Z" }), ATE)).toBe(false);
    expect(ficouSemDesfecho(f({ inicio: "2026-10-07T12:00:00Z" }), "2026-10-07")).toBe(true);
  });

  it("o dia é o da clínica: 21h30 de 06/10 em São Paulo já é 07/10 em UTC", () => {
    expect(ficouSemDesfecho(f({ inicio: "2026-10-07T00:30:00Z" }), ATE)).toBe(true);
  });

  it("quem passou pelo balcão não é falta, mesmo sem finalizar", () => {
    for (const etapa of ["recepcao", "caixa", "triagem", "atendimento", "exame", "finalizado"]) {
      expect(ficouSemDesfecho(f({ fluxo_etapa: etapa }), ATE)).toBe(false);
    }
  });

  it("realizado, cancelado e faltou já têm desfecho", () => {
    for (const status of ["realizado", "cancelado", "faltou"]) {
      expect(ficouSemDesfecho(f({ status }), ATE)).toBe(false);
    }
  });

  it("vaga livre e bloqueio da grade não são paciente", () => {
    expect(ficouSemDesfecho(f({ paciente_id: null, paciente_nome: "DISPONIVEL" }), ATE)).toBe(
      false,
    );
    expect(ficouSemDesfecho(f({ paciente_id: null, paciente_nome: "BLOQUEIO" }), ATE)).toBe(false);
  });
});
