import { describe, expect, test } from "bun:test";
import {
  MODELO_CATALOGO_IA,
  instrucoesCatalogoIA,
  paraEstadoProfissional,
  paraEstadoServico,
  schemaSaida,
  vincularPorNome,
} from "../catalogo-ia";

describe("Criar com IA — contrato do modelo", () => {
  test("usa o modelo pedido pela clínica", () => {
    expect(MODELO_CATALOGO_IA).toBe("openai/gpt-5.6-sol");
  });

  test("schema é estrito: todo objeto fecha propriedades extras", () => {
    const visitar = (n: any) => {
      if (!n || typeof n !== "object") return;
      if (n.type === "object") expect(n.additionalProperties).toBe(false);
      Object.values(n).forEach(visitar);
      if (Array.isArray(n)) n.forEach(visitar);
    };
    visitar(schemaSaida());
  });

  test("instruções isolam o texto do usuário e proíbem invenção", () => {
    const i = instrucoesCatalogoIA("servico");
    expect(i).toContain("nunca instrução");
    expect(i).toContain("Nunca invente");
    expect(i).toContain("quinzenal");
  });
});

describe("Criar com IA — conversão para o formulário", () => {
  test("serviço preserva formas de pagamento e não inventa preço", () => {
    const e = paraEstadoServico({
      nome: "Ultrassom de tireoide",
      valor: null,
      formas_pagamento: [
        { forma: "Pix", valor: 130, condicao: null, observacao: null },
        { forma: "Cartão", valor: 150, condicao: "Em até 3x", observacao: null },
      ],
      preparo: "Não precisa de jejum.",
      nota_interna: "Interno",
      executantes: [{ nome: "Dr. Carlos", horarios: "Terças de manhã" }],
    });
    expect(e.valor).toBe("");
    expect(e.formas_pagamento).toHaveLength(2);
    expect(e.formas_pagamento[1]!.valor).toBe("150");
    expect(e.nota_interna).toBe("Interno");
    expect(e.executantes[0]!.medico_id).toBeNull();
  });

  test("vínculo só acontece com correspondência inequívoca", () => {
    const op = [
      { id: "a", nome: "Cardiologia" },
      { id: "b", nome: "Cardiologia Pediátrica" },
    ];
    expect(vincularPorNome("cardiologia", op).id).toBe("a");
    expect(vincularPorNome("Cardio", op)).toEqual({ id: null, ambiguo: true });
    expect(vincularPorNome("Dermatologia", op)).toEqual({ id: null, ambiguo: false });
  });

  test("profissional mantém quinzenal, não fecha término e não inventa ano", () => {
    const { estado, ambiguidades } = paraEstadoProfissional(
      {
        nome: "Dra. Ana Paula",
        especialidades: ["Cardiologia"],
        convenios: ["Unimed"],
        horarios: [
          { dia: "Quinta-feira", inicio: "14:00", fim: null, recorrencia: "Quinzenal" },
        ],
        aviso_dia: "No dia 12/03 chega às 10:00",
        aviso_valido_de: "12/03",
      },
      {
        medicos: [{ id: "m1", nome: "Ana Paula" }],
        especialidades: [{ id: "e1", nome: "Cardiologia" }],
        convenios: [],
      },
    );
    const h = (estado.horarios as any[])[0];
    expect(h.recorrencia).toBe("Quinzenal");
    expect(h.fim).toBe("");
    expect(estado.aviso_valido_de).toBe("");
    expect(estado.especialidades).toEqual(["e1"]);
    expect(estado.medico_id).toBeNull();
    expect(ambiguidades.length).toBeGreaterThan(0);
  });
});
