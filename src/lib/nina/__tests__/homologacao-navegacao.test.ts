import { describe, expect, it } from "bun:test";
import { leadDoRelatorio } from "../homologacao-navegacao";

const leads = [
  { id: "lead-1", indice: 1, conversaId: "conversa-1" },
  { id: "lead-2", indice: 2, conversaId: "conversa-2" },
];

describe("Laboratório Nina → chat de homologação", () => {
  it("seleciona a conversa do relatório depois de a lista carregar", () => {
    const alvo = { clinicaId: "clinica-a", conversaId: "conversa-2" };
    expect(leadDoRelatorio([], "clinica-a", alvo)).toBeNull();
    expect(leadDoRelatorio(leads, "clinica-a", alvo)?.id).toBe("lead-2");
  });
  it("mantém o vínculo com o lead quando o relatório é de um ciclo anterior", () => {
    expect(
      leadDoRelatorio(leads, "clinica-a", {
        clinicaId: "clinica-a",
        conversaId: "ciclo-anterior",
        leadIndice: 2,
      })?.id,
    ).toBe("lead-2");
  });
  it("a identidade da conversa prevalece sobre o índice", () => {
    expect(
      leadDoRelatorio(leads, "clinica-a", {
        clinicaId: "clinica-a",
        conversaId: "conversa-2",
        leadIndice: 1,
      })?.id,
    ).toBe("lead-2");
  });
  it("não abre um paciente de outra clínica ou um lead arbitrário", () => {
    expect(
      leadDoRelatorio(leads, "clinica-b", { clinicaId: "clinica-a", leadIndice: 2 }),
    ).toBeNull();
    expect(
      leadDoRelatorio(leads, "clinica-a", { clinicaId: "clinica-a", leadIndice: 99 }),
    ).toBeNull();
    expect(leadDoRelatorio(leads, "clinica-a", null)).toBeNull();
  });
});
