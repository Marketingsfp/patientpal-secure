import { describe, expect, it } from "bun:test";
import {
  cenariosDaSelecao,
  proximoLoteBateria,
  type ProfissionalBateriaUI,
} from "./carga-teste-ui";

const consulta = (nome: string) => ({
  consulta: nome,
  especialidade: null,
  dinheiro: null,
  pixCartao: null,
  modalidade: "Hora marcada",
  esperado: "agendar",
  esperadoRotulo: "Agendar com o profissional",
});
const profissional = (id: string, consultas: number, testado = false): ProfissionalBateriaUI => ({
  id,
  nome: id,
  vagas: 3,
  vinculadoAgenda: true,
  ultimoTeste: testado ? { em: "2026-09-25T12:00:00Z", resultado: "aprovado" } : null,
  consultas: Array.from({ length: consultas }, (_, i) => consulta(`CONSULTA ${i + 1}`)),
});

describe("seleção da bateria por profissional", () => {
  const lista = [
    profissional("a", 1, true),
    profissional("b", 2),
    profissional("c", 1),
    profissional("d", 3),
    profissional("e", 1),
  ];

  it("cada consulta publicada vezes os perfis de paciente vira um cenário", () => {
    expect(cenariosDaSelecao(lista, new Set(["b", "c"]), 1)).toBe(3);
    expect(cenariosDaSelecao(lista, new Set(["b", "c"]), 2)).toBe(6);
    expect(cenariosDaSelecao(lista, new Set(), 3)).toBe(0);
  });

  it("próximo lote pula quem já foi testado e não passa do limite", () => {
    expect(proximoLoteBateria(lista, 1, 10)).toEqual(["b", "c", "d", "e"]);
    // Com dois perfis por consulta: b (4) + c (2) + e (2) cabem; d (6) estouraria o limite.
    expect(proximoLoteBateria(lista, 2, 10)).toEqual(["b", "c", "e"]);
    expect(proximoLoteBateria(lista, 1, 2)).toEqual(["b"]);
  });
});
