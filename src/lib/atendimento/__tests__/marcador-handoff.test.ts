import { describe, expect, it } from "bun:test";
import { ehMarcadorHandoff, textoMarcadorSistema } from "../marcador-handoff";

const MARCADOR =
  "🔁 Conversa transferida da Nina para atendimento humano · Setor: Recepção · Motivo: patient_request · Posição na fila: 3\nResumo: paciente quer remarcar consulta de cardiologia da próxima terça.";

describe("marcador de handoff na timeline", () => {
  it("reconhece o marcador extenso", () => {
    expect(ehMarcadorHandoff(MARCADOR)).toBe(true);
    expect(ehMarcadorHandoff("🧾 Handoff realizado pela Nina · Protocolo: MJ-4")).toBe(false);
    expect(ehMarcadorHandoff(null)).toBe(false);
  });

  it("compacta sem motivo, fila nem resumo", () => {
    const t = textoMarcadorSistema(MARCADOR);
    expect(t).toBe("Transferida para atendimento humano · Recepção");
    expect(t).not.toMatch(/Resumo:/);
    expect(t).not.toMatch(/Posição na fila/);
    expect(t).not.toMatch(/Motivo:/);
  });

  it("mantém urgência e funciona sem setor (conversas antigas)", () => {
    expect(
      textoMarcadorSistema(
        "🔁 Conversa transferida da Nina para atendimento humano · Motivo: x · URGENTE · Posição na fila: 1",
      ),
    ).toBe("Transferida para atendimento humano · URGENTE");
  });

  it("não altera outros marcadores de sistema", () => {
    const protocolo = "🧾 Handoff realizado pela Nina · Protocolo: MJ-4 · Destino: Recepção";
    expect(textoMarcadorSistema(protocolo)).toBe(protocolo);
  });
});
