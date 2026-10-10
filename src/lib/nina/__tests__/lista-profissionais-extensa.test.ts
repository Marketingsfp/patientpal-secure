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

test("pedido para ver/escolher a lista com mais de 8 profissionais vai para a equipe", () => {
  expect(LIMITE_LISTA_PROFISSIONAIS).toBe(8);
  expect(
    listaProfissionaisExtensa(
      "consultar_cadastro",
      args({ termo: "cardiologia", objetivos: ["medicos"] }),
      {
        doctors: nomes(9),
      },
    ),
  ).toEqual({ total: 9, especialidade: "cardiologia" });
  expect(
    listaProfissionaisExtensa(
      "consultar_cadastro",
      args({ termo: "cardiologia", objetivos: ["medicos"] }),
      {
        doctors: nomes(8),
      },
    ),
  ).toBeNull();
});

test.each([
  { objetivos: ["informacoes_gerais"] },
  { objetivos: ["agendamento"] },
  { objetivos: ["informacoes_gerais", "agendamento"] },
  { objetivos: ["horarios", "agendamento"] },
  { objetivos: ["valor", "horarios"] },
])("existência, agendamento e primeira vaga não pedem lista: %j", ({ objetivos }) => {
  expect(
    listaProfissionaisExtensa("consultar_cadastro", args({ termo: "cardiologia", objetivos }), {
      doctors: nomes(9),
    }),
  ).toBeNull();
});

test.each([null, "{", "{}", '{"objetivos":"medicos"}'])(
  "sem objetivo de lista válido não atribui um pedido ao paciente: %s",
  (argumentos) => {
    expect(
      listaProfissionaisExtensa("consultar_cadastro", argumentos, { doctors: nomes(9) }),
    ).toBeNull();
  },
);

test("pedido misto que inclui ver a lista mantém o limite", () => {
  expect(
    listaProfissionaisExtensa(
      "consultar_cadastro",
      args({ termo: "cardiologia", objetivos: ["valor", "medicos", "agendamento"] }),
      { doctors: nomes(9) },
    ),
  ).toEqual({ total: 9, especialidade: "cardiologia" });
});

test("pedido pelo nome, esclarecimento, exame e outras ferramentas não entram na regra", () => {
  expect(
    listaProfissionaisExtensa(
      "consultar_cadastro",
      args({ termo: "cardiologia", medico: "Dr. 1", objetivos: ["medicos"] }),
      { doctors: nomes(9) },
    ),
  ).toBeNull();
  expect(
    listaProfissionaisExtensa(
      "consultar_cadastro",
      args({ termo: "cardio", objetivos: ["medicos"] }),
      {
        doctors: nomes(9),
        esclarecimento: { pergunta: "?" },
      },
    ),
  ).toBeNull();
  expect(
    listaProfissionaisExtensa(
      "consultar_cadastro",
      args({ termo: "ecg", objetivos: ["medicos"] }),
      {
        doctors: nomes(9),
        tipo_atendimento: "exame_procedimento",
      },
    ),
  ).toBeNull();
  expect(listaProfissionaisExtensa("proxima_vaga", args({}), { doctors: nomes(9) })).toBeNull();
});

test("aviso interno legível e na categoria Agendamento", () => {
  const motivo = motivoListaExtensa({ total: 9, especialidade: "cardiologia" });
  expect(motivoParaAtendimento(motivo)).toContain("mais de 8 profissionais");
  expect(categoriaDoMotivo(motivo)).toBe("agendamento");
  expect(motivoLegivel(motivo)).toBe('9 profissionais em "cardiologia".');
});
