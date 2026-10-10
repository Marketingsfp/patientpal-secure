import { describe, expect, it } from "bun:test";
import { planejarPrefetch } from "../prefetch-cadastro";
import { textoDoPedidoLido } from "../leitura-imagem";

const cat = {
  servicos: [
    { nome: "Ultrassom" },
    { nome: "Ultrassom de tireoide" },
    { nome: "Eletrocardiograma" },
  ],
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
    expect(p?.chamadas[0]).toEqual({
      nome: "consultar_cadastro",
      args: {
        termo: "CLÍNICA GERAL",
        objetivos: ["horarios", "agendamento"],
        tipo_atendimento: "consulta",
      },
    });
  });
  it("exame usa o nome mais específico", () => {
    expect(planejarPrefetch("quanto custa ultrassom de tireoide", "valor", cat)?.termo).toBe(
      "Ultrassom de tireoide",
    );
  });
  it("profissional com nome único chama buscar_medicos", () => {
    expect(
      planejarPrefetch("quero marcar com a Brandão", "agendamento", cat)?.chamadas[0]?.nome,
    ).toBe("buscar_medicos");
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
    expect(
      intencoesParaPrefetch({
        choice: "valor",
        confidence: 0.52,
        probabilities: { valor: 0.55, agendamento: 0.23, disponibilidade: 0.19, consulta: 0.03 },
      }),
    ).toEqual(["valor", "agendamento", "disponibilidade"]);
  });
  it("divisão com intenção não elegível não libera", () => {
    expect(
      intencoesParaPrefetch({
        choice: "valor",
        confidence: 0.5,
        probabilities: { valor: 0.5, cancelamento: 0.45 },
      }),
    ).toEqual([]);
  });
  it("'quanto ta a consulta com dermatologista? tem vaga' consulta valor e horários", () => {
    const p = planejarPrefetch(
      "bom dia, quanto ta a consulta com dermatologista? tem vaga semana q vem?",
      ["valor", "agendamento", "disponibilidade"],
      cat,
    );
    expect(p?.termo).toBe("DERMATOLOGIA");
    expect(p?.chamadas[0]?.args.objetivos).toEqual(["valor", "agendamento", "horarios"]);
  });
  it("'tem clinico hj ainda? to gripado...' consulta clínica geral", () => {
    expect(
      planejarPrefetch(
        "oi tem clinico hj ainda? to gripado queria passa no medico ainda hoje dps do almoço",
        ["disponibilidade", "agendamento"],
        cat,
      )?.termo,
    ).toBe("CLÍNICA GERAL");
  });
});
describe("intenção dividida com histórico", () => {
  it("valor 0,42 + disponibilidade 0,34 + agendamento 0,10 + consulta 0,03 libera", () => {
    expect(
      intencoesParaPrefetch({
        choice: "valor",
        confidence: 0.39,
        probabilities: {
          valor: 0.42,
          disponibilidade: 0.34,
          agendamento: 0.1,
          consulta: 0.03,
          continuacao: 0.11,
        },
      }),
    ).toEqual(["valor", "disponibilidade", "agendamento"]);
  });
});
describe("especialidades no formato do cadastro publicado", () => {
  const catObj = {
    servicos: [],
    profissionais: [
      { nome: "Fulana Teste", especialidades: [{ id: "1", nome: "DERMATOLOGIA" }] },
      { nome: "Beltrano Teste", especialidades: [{ id: "2", nome: "CLÍNICA GERAL" }] },
    ],
  };
  it("usa o nome da especialidade, nunca '[object Object]'", () => {
    const p = planejarPrefetch("quanto ta a consulta com dermatologista?", ["valor"], catObj);
    expect(p?.termo).toBe("DERMATOLOGIA");
  });
  it("mensagem sem atendimento não pré-busca", () => {
    expect(planejarPrefetch("bom dia, tudo bem?", ["valor"], catObj)).toBeNull();
  });
});

describe("foto de pedido não seleciona recurso como profissional (MJ-867)", () => {
  const catalogo = {
    servicos: [{ nome: "MAPA 24 HORAS" }, { nome: "Eletrocardiograma" }],
    profissionais: [{ nome: "MAPA", especialidades: [] }],
  };
  it("sigla e duração da foto seguem à identificação normal, sem buscar o profissional MAPA", () => {
    for (const nome of ["MAPA 24h", "M.A.P.A. 24h", "MAPA"])
      for (const intencao of ["exame", "agendamento", "valor"] as const)
        expect(planejarPrefetch(textoDoPedidoLido([nome]), intencao, catalogo)).toBeNull();
  });
  it("legenda não transforma um item não identificado em escolha de profissional", () => {
    expect(
      planejarPrefetch(textoDoPedidoLido(["MAPA 24h"], "Pedido do Brandão"), "exame", {
        ...catalogo,
        profissionais: cat.profissionais,
      }),
    ).toBeNull();
  });
  it("exame inequívoco ainda usa a pré-busca de serviços", () => {
    const p = planejarPrefetch(textoDoPedidoLido(["Eletrocardiograma"]), "exame", catalogo);
    expect(p?.tipo).toBe("servico");
    expect(p?.chamadas[0]).toEqual({
      nome: "consultar_cadastro",
      args: {
        termo: "Eletrocardiograma",
        objetivos: ["informacoes_gerais"],
        tipo_atendimento: "exame_procedimento",
      },
    });
  });
});
