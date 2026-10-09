import { expect, test } from "bun:test";
import {
  listaProfissionaisExtensa,
  motivoListaExtensa,
  LIMITE_LISTA_PROFISSIONAIS,
} from "../lista-profissionais-extensa";
import { motivoParaAtendimento } from "@/lib/atendimento/texto-interno-apresentacao";
import { categoriaDoMotivo } from "../jev-motivo";
import { motivoLegivel } from "../jev-encaminhamento";

const nomes = (n: number) => Array.from({ length: n }, (_, i) => `Dr. ${i}`);
const args = (o: Record<string, unknown>) => JSON.stringify(o);

test("mais de 8 profissionais na lista da especialidade vai para a equipe (08/10/2026)", () => {
  expect(LIMITE_LISTA_PROFISSIONAIS).toBe(8);
  expect(
    listaProfissionaisExtensa("consultar_cadastro", args({ termo: "cardiologia" }), {
      doctors: nomes(9),
    }),
  ).toEqual({ total: 9, especialidade: "cardiologia" });
  expect(
    listaProfissionaisExtensa("consultar_cadastro", args({ termo: "cardiologia" }), {
      doctors: nomes(8),
    }),
  ).toBeNull();
});

test("pedido pelo nome, esclarecimento, exame e outras ferramentas não entram na regra", () => {
  expect(
    listaProfissionaisExtensa(
      "consultar_cadastro",
      args({ termo: "cardiologia", medico: "Dr. 1" }),
      { doctors: nomes(9) },
    ),
  ).toBeNull();
  expect(
    listaProfissionaisExtensa("consultar_cadastro", args({ termo: "cardio" }), {
      doctors: nomes(9),
      esclarecimento: { pergunta: "?" },
    }),
  ).toBeNull();
  expect(
    listaProfissionaisExtensa("consultar_cadastro", args({ termo: "ecg" }), {
      doctors: nomes(9),
      tipo_atendimento: "exame_procedimento",
    }),
  ).toBeNull();
  expect(listaProfissionaisExtensa("proxima_vaga", args({}), { doctors: nomes(9) })).toBeNull();
});

test("aviso interno legível e na categoria Agendamento", () => {
  const motivo = motivoListaExtensa({ total: 9, especialidade: "cardiologia" });
  expect(motivoParaAtendimento(motivo)).toContain("mais de 8 profissionais");
  expect(categoriaDoMotivo(motivo)).toBe("agendamento");
  expect(motivoLegivel(motivo)).toBe('9 profissionais em "cardiologia".');
});
