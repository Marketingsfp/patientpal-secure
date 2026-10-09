import { expect, test } from "bun:test";
import { profissionalDoRegistro, profissionalParaEnvio } from "../catalogo/FormProfissional";
import { servicoDoRegistro, servicoParaEnvio } from "../catalogo/FormServico";

test("editar e salvar o formulário preserva o escopo da escala sincronizada", () => {
  const horario = {
    tipo_escala: "consulta",
    dia: "Quinta-feira",
    inicio: "09:30",
    fim: "17:00",
    recorrencia: "Toda semana",
    observacao: "Agenda: Geral",
  } as const;
  const estado = profissionalDoRegistro({ nome: "João Hélio", horarios: [horario] });
  estado.nome = "Dr. João Hélio";
  expect(
    profissionalParaEnvio(estado, {
      procedimentos: [],
      medicos: [],
      especialidades: [],
      unidades: [],
      convenios: [],
    }).horarios[0],
  ).toEqual(horario);
  const servico = servicoDoRegistro({
    nome: "Exame ocular",
    executantes: [
      {
        nome: "João Hélio",
        horarios: "Quarta-feira 09:30–17:00",
        tipo_escala: "exame_procedimento",
      },
    ],
  });
  expect(servicoParaEnvio(servico).executantes[0]!.tipo_escala).toBe("exame_procedimento");
});
