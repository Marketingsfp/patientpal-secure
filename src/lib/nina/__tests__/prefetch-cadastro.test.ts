import { describe, expect, it } from "bun:test";
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
    expect(planejarPrefetch("quanto custa ultrassom de tireoide", "valor", cat)?.termo)
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

import { intencoesParaPrefetch } from "../prefetch-cadastro";
describe("intenção dividida do Jev", () => {
  it("valor 0,55 + agendamento 0,23 + disponibilidade 0,19 libera a pré-busca", () => {
    expect(intencoesParaPrefetch({ choice: "valor", confidence: 0.52,
      probabilities: { valor: 0.55, agendamento: 0.23, disponibilidade: 0.19, consulta: 0.03 } }))
      .toEqual(["valor", "agendamento", "disponibilidade"]);
  });
  it("divisão com intenção não elegível não libera", () => {
    expect(intencoesParaPrefetch({ choice: "valor", confidence: 0.5,
      probabilities: { valor: 0.5, cancelamento: 0.45 } })).toEqual([]);
  });
  it("'quanto ta a consulta com dermatologista? tem vaga' consulta valor e horários", () => {
    const p = planejarPrefetch("bom dia, quanto ta a consulta com dermatologista? tem vaga semana q vem?",
      ["valor", "agendamento", "disponibilidade"], cat);
    expect(p?.termo).toBe("DERMATOLOGIA");
    expect(p?.chamadas[0]?.args.objetivos).toEqual(["valor", "agendamento", "horarios"]);
  });
  it("'tem clinico hj ainda? to gripado...' consulta clínica geral", () => {
    expect(planejarPrefetch("oi tem clinico hj ainda? to gripado queria passa no medico ainda hoje dps do almoço",
      ["disponibilidade", "agendamento"], cat)?.termo).toBe("CLÍNICA GERAL");
  });
});
