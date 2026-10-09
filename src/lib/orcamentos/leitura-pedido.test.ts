import { describe, expect, it } from "bun:test";
import { interpretarLeituraPedidoBalcao, medicosComNomeLido } from "./leitura-pedido";

describe("interpretarLeituraPedidoBalcao", () => {
  it("lê exames, paciente e médico (sem o Dr.) em maiúsculas", () => {
    const r = interpretarLeituraPedidoBalcao(
      '{"tipo":"pedido_medico","itens":["Hemograma","TSH"],"paciente_nome":"Maria da Silva","medico_nome":"Dr. João Souza"}',
    );
    expect(r.leitura).toEqual({ tipo: "pedido_medico", itens: ["Hemograma", "TSH"] });
    expect(r.pacienteNome).toBe("MARIA DA SILVA");
    expect(r.medicoNome).toBe("JOÃO SOUZA");
  });

  it("nome vazio, null ou sem letras não vira nome", () => {
    const r = interpretarLeituraPedidoBalcao(
      '{"tipo":"pedido_medico","itens":["TSH"],"paciente_nome":"null","medico_nome":"123"}',
    );
    expect(r.pacienteNome).toBeNull();
    expect(r.medicoNome).toBeNull();
  });

  it("marcação incerta mantém os nomes, mas nenhum exame", () => {
    const r = interpretarLeituraPedidoBalcao(
      '{"tipo":"marcacao_incerta","itens":["TSH"],"paciente_nome":"Ana Lima","medico_nome":null}',
    );
    expect(r.leitura).toEqual({ tipo: "marcacao_incerta" });
    expect(r.pacienteNome).toBe("ANA LIMA");
  });

  it("receita de remédio, documento ou resposta quebrada não trazem nomes", () => {
    expect(
      interpretarLeituraPedidoBalcao('{"tipo":"receita_remedio","itens":[],"paciente_nome":"Ana"}')
        .pacienteNome,
    ).toBeNull();
    expect(interpretarLeituraPedidoBalcao("sem json").leitura.tipo).toBe("falha_tecnica");
  });
});

describe("medicosComNomeLido", () => {
  const medicos = [
    { id: "1", nome: "JOÃO PEDRO SOUZA" },
    { id: "2", nome: "JOÃO CARLOS LIMA" },
    { id: "3", nome: "VALÉRIA DOS SANTOS" },
  ];

  it("acha o médico mesmo com acento, título e nome do meio faltando", () => {
    expect(medicosComNomeLido("Dra. Valeria Santos", medicos).map((m) => m.id)).toEqual(["3"]);
    expect(medicosComNomeLido("JOAO SOUZA", medicos).map((m) => m.id)).toEqual(["1"]);
  });

  it("só o primeiro nome devolve todos os parecidos para a recepção escolher", () => {
    expect(medicosComNomeLido("João", medicos).map((m) => m.id)).toEqual(["1", "2"]);
  });

  it("nome que não está no cadastro não acha ninguém", () => {
    expect(medicosComNomeLido("Pedro Alves", medicos)).toEqual([]);
  });
});
