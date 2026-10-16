import { describe, expect, it } from "bun:test";
import { numerarFichas, numerarFichasFormatadas } from "./ficha-numero";

const MED = "med-1";
const AG = "ag-1";

function linha(id: string, hora: string, nome = "PACIENTE", agenda: string | null = AG) {
  return {
    id,
    inicio: `2026-09-09T${hora}:00-03:00`,
    paciente_nome: nome,
    medico_id: MED,
    agenda_id: agenda,
  };
}

describe("numerarFichas", () => {
  it("numera na ordem do horário, 1 em 1", () => {
    const m = numerarFichas([linha("a", "08:00"), linha("b", "08:10"), linha("c", "08:20")]);
    expect(m.get("a")).toBe(1);
    expect(m.get("b")).toBe(2);
    expect(m.get("c")).toBe(3);
  });

  it("não depende da ordem em que as linhas chegam", () => {
    const m = numerarFichas([linha("c", "08:20"), linha("a", "08:00"), linha("b", "08:10")]);
    expect(m.get("a")).toBe(1);
    expect(m.get("c")).toBe(3);
  });

  it("dois agendamentos no mesmo horário recebem números diferentes, por ordem de lançamento", () => {
    const leticia = { ...linha("let", "14:51", "LETICIA"), created_at: "2026-10-15T10:20:26Z" };
    const denise = { ...linha("den", "14:51", "DENISE"), created_at: "2026-10-15T11:18:13Z" };
    const vitoria = { ...linha("vit", "14:51"), inicio: "2026-09-09T14:51:01-03:00" };
    const m = numerarFichas([denise, vitoria, leticia]);
    expect(m.get("let")).toBe(1);
    expect(m.get("den")).toBe(2);
    expect(m.get("vit")).toBe(3);
  });

  it("cada agenda do mesmo médico tem sequência própria", () => {
    const m = numerarFichas([
      linha("a", "08:00", "X", "ag-1"),
      linha("b", "08:10", "X", "ag-2"),
      linha("c", "08:20", "X", "ag-1"),
    ]);
    expect(m.get("a")).toBe(1);
    expect(m.get("b")).toBe(1);
    expect(m.get("c")).toBe(2);
  });

  it("a numeração reinicia a cada dia", () => {
    const m = numerarFichas([
      linha("a", "08:00"),
      { id: "b", inicio: "2026-09-10T08:00:00-03:00", medico_id: MED, agenda_id: AG },
    ]);
    expect(m.get("a")).toBe(1);
    expect(m.get("b")).toBe(1);
  });

  it("a versão formatada sai com três dígitos", () => {
    expect(numerarFichasFormatadas([linha("a", "08:00")]).get("a")).toBe("001");
  });
});
