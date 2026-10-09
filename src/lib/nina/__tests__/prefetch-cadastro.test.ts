import { describe, expect, it } from "vitest";
import { planejarPrefetch } from "../prefetch-cadastro";

const cat = {
  servicos: [{ nome: "Ultrassom" }, { nome: "Ultrassom de tireoide" }, { nome: "Eletrocardiograma" }],
  profissionais: [
    { nome: "Carlos Eduardo Brandão", especialidades: ["CLÍNICA GERAL"] },
    { nome: "Marina Almeida Dias", especialidades: ["CARDIOLOGIA"] },
    { nome: "Claudia Maria Santos", especialidades: ["GINECOLOGIA"] },
    { nome: "Claudia Rocha", especialidades: ["DERMATOLOGIA"] },
  ],
};

describe("pré-busca do cadastro", () => {
  it("'tem clinico hj ainda?' consulta clínica geral", () => {
    const p = planejarPrefetch("tem clinico hj ainda?", "disponibilidade", cat);
    expect(p?.chamadas[0]).toEqual({ nome: "consultar_cadastro",
      args: { termo: "CLÍNICA GERAL", objetivos: ["horarios", "agendamento"], tipo_atendimento: "consulta" } });
  });
  it("exame usa o nome mais específico", () => {
    expect(planejarPrefetch("quanto custa ultrassom de tireoide", "valor", cat)?.plano ?? planejarPrefetch("quanto custa ultrassom de tireoide", "valor", cat)?.termo)
      .toBe("Ultrassom de tireoide");
  });
  it("profissional com nome único chama buscar_medicos", () => {
    expect(planejarPrefetch("quero marcar com a Brandão", "agendamento", cat)?.chamadas[0]?.nome).toBe("buscar_medicos");
  });
  it("nome ambíguo não pré-busca", () => {
    expect(planejarPrefetch("quero marcar com a claudia", "agendamento", cat)).toBeNull();
  });
  it("dois atendimentos não pré-busca", () => {
    expect(planejarPrefetch("cardiologia e eletrocardiograma", "agendamento", cat)).toBeNull();
  });
  it("sem intenção segura ou intenção fora da lista não pré-busca", () => {
    expect(planejarPrefetch("cardiologia", null, cat)).toBeNull();
    expect(planejarPrefetch("cardiologia", "cancelamento", cat)).toBeNull();
  });
});
