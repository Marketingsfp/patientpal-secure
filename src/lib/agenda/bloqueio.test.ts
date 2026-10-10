import { describe, expect, it } from "bun:test";
import {
  bloqueioNoIntervalo,
  diaTodoBloqueado,
  ehBloqueioAgenda,
  faixasDeBloqueio,
  motivoDoBloqueio,
  observacaoDoBloqueio,
} from "./bloqueio";

const h = (hm: string) => `2026-10-12T${hm}:00-03:00`;
const ficha = (id: string, ini: string, fim: string, nome: string, obs: string | null = null) => ({
  id,
  paciente_nome: nome,
  paciente_id: null,
  status: "agendado",
  inicio: h(ini),
  fim: h(fim),
  observacoes: obs,
  medico_id: "m1",
  agenda_id: "a1",
  diaIso: "2026-10-12",
});

describe("bloqueio de agenda", () => {
  it("reconhece o bloqueio só sem paciente, com ou sem caixa", () => {
    expect(ehBloqueioAgenda({ paciente_nome: "BLOQUEIO" })).toBe(true);
    expect(ehBloqueioAgenda({ paciente_nome: " bloqueio " })).toBe(true);
    expect(ehBloqueioAgenda({ paciente_nome: "BLOQUEIO", paciente_id: "p1" })).toBe(false);
    expect(ehBloqueioAgenda({ paciente_nome: "DISPONÍVEL" })).toBe(false);
  });

  it("lê o motivo gravado e ignora o texto padrão antigo", () => {
    expect(motivoDoBloqueio(observacaoDoBloqueio("CONGRESSO"))).toBe("CONGRESSO");
    expect(motivoDoBloqueio("Bloqueado pela recepção")).toBe("");
    expect(motivoDoBloqueio(null)).toBe("");
  });

  it("acha o bloqueio que cruza o horário pedido", () => {
    const linhas = [
      ficha("1", "08:00", "08:30", "BLOQUEIO"),
      ficha("2", "08:30", "09:00", "DISPONÍVEL"),
    ];
    expect(bloqueioNoIntervalo(linhas, h("08:15"), h("08:45"))?.id).toBe("1");
    expect(bloqueioNoIntervalo(linhas, h("08:30"), h("09:00"))).toBeNull();
    expect(
      bloqueioNoIntervalo([{ ...linhas[0], status: "cancelado" }], h("08:00"), h("08:30")),
    ).toBeNull();
  });

  it("dia todo bloqueado só quando todas as fichas vivas são bloqueio", () => {
    expect(diaTodoBloqueado([ficha("1", "08:00", "08:30", "BLOQUEIO")])).toBe(true);
    expect(
      diaTodoBloqueado([
        ficha("1", "08:00", "08:30", "BLOQUEIO"),
        ficha("2", "08:30", "09:00", "DISPONÍVEL"),
      ]),
    ).toBe(false);
    expect(diaTodoBloqueado([])).toBe(false);
  });

  it("junta fichas seguidas numa faixa e separa no vão do almoço", () => {
    const obs = observacaoDoBloqueio("FOLGA");
    const f = faixasDeBloqueio([
      ficha("1", "08:00", "08:30", "BLOQUEIO", obs),
      ficha("2", "08:30", "09:00", "BLOQUEIO", obs),
      ficha("3", "13:00", "13:30", "BLOQUEIO", obs),
      ficha("4", "09:00", "09:30", "DISPONÍVEL"),
    ]);
    expect(f.get("1")?.cabecaId).toBe("1");
    expect(f.get("2")?.cabecaId).toBe("1");
    expect(f.get("1")?.fim).toBe(h("09:00"));
    expect(f.get("1")?.motivo).toBe("FOLGA");
    expect(f.get("3")?.cabecaId).toBe("3");
    expect(f.has("4")).toBe(false);
  });
});
