import { describe, expect, it } from "bun:test";
import { ficouSemDesfecho } from "./sem-desfecho";

const HOJE = "2026-10-07";
const f = (o: Partial<Parameters<typeof ficouSemDesfecho>[0]> = {}) => ({
  inicio: "2026-10-06T13:00:00Z",
  status: "agendado",
  fluxo_etapa: "aguardando_recepcao",
  paciente_nome: "MARIA",
  paciente_id: "p1",
  ...o,
});

describe("ficouSemDesfecho", () => {
  it("dia passado, agendado ou confirmado, sem check-in → sem desfecho", () => {
    expect(ficouSemDesfecho(f(), HOJE)).toBe(true);
    expect(ficouSemDesfecho(f({ status: "confirmado" }), HOJE)).toBe(true);
    expect(ficouSemDesfecho(f({ fluxo_etapa: null }), HOJE)).toBe(true);
  });

  it("hoje ainda não conta: o paciente pode chegar até o fim do dia", () => {
    expect(ficouSemDesfecho(f({ inicio: "2026-10-07T12:00:00Z" }), HOJE)).toBe(false);
  });

  it("o dia é o da clínica: 21h de ontem em São Paulo já é amanhã em UTC", () => {
    expect(ficouSemDesfecho(f({ inicio: "2026-10-07T00:30:00Z" }), HOJE)).toBe(true);
  });

  it("quem passou pelo balcão não é falta, mesmo sem finalizar", () => {
    for (const etapa of ["recepcao", "caixa", "triagem", "atendimento", "exame", "finalizado"]) {
      expect(ficouSemDesfecho(f({ fluxo_etapa: etapa }), HOJE)).toBe(false);
    }
  });

  it("realizado, cancelado e faltou já têm desfecho", () => {
    for (const status of ["realizado", "cancelado", "faltou"]) {
      expect(ficouSemDesfecho(f({ status }), HOJE)).toBe(false);
    }
  });

  it("vaga livre e bloqueio da grade não são paciente", () => {
    expect(ficouSemDesfecho(f({ paciente_id: null, paciente_nome: "DISPONIVEL" }), HOJE)).toBe(
      false,
    );
    expect(ficouSemDesfecho(f({ paciente_id: null, paciente_nome: "BLOQUEIO" }), HOJE)).toBe(false);
  });
});
