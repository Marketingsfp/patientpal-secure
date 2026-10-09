import { expect, test } from "bun:test";
import {
  horariosDoMedico,
  mapearProfissionais,
  mapearServicos,
  type EntradaOperacional,
} from "../fonte-operacional";
import { profissionalParaRegistro, servicoParaRegistro } from "../catalogo-conhecimento";
import { adaptarCadastroCompleto } from "../catalogo-importacao";
import { resumoHorarios, horarioSchema } from "../catalogo";

const entrada: EntradaOperacional = {
  hojeISO: "2026-10-06",
  medicos: [{ id: "joao", nome: "João Hélio", especialidade_id: "oftalmo" }],
  especialidades: [{ id: "oftalmo", nome: "OFTALMOLOGIA" }],
  procedimentos: [
    {
      id: "consulta",
      nome: "CONSULTA OFTALMO",
      tipo: "consulta",
      valor_dinheiro: 120,
      valor_cartao: 145,
    },
    { id: "exame", nome: "EXAME OCULAR", tipo: "exame", valor_dinheiro: 80, valor_cartao: 100 },
  ],
  agendas: [
    { id: "c", medico_id: "joao", nome: "CONSULTAS" },
    { id: "e", medico_id: "joao", nome: "EXAMES" },
  ],
  vinculos: [
    { medico_id: "joao", procedimento_id: "consulta" },
    { medico_id: "joao", procedimento_id: "exame" },
  ],
  disponibilidades: [1, 2, 4, 5]
    .map((dia_semana) => ({
      medico_id: "joao",
      agenda_id: "c",
      dia_semana,
      hora_inicio: "09:30",
      hora_fim: "17:00",
    }))
    .concat(
      [1, 2, 3, 4, 5].map((dia_semana) => ({
        medico_id: "joao",
        agenda_id: "e",
        dia_semana,
        hora_inicio: "09:30",
        hora_fim: "17:00",
      })),
    ),
};

test("sincronização separa consultas de exames, inclusive descrição e observações", () => {
  const resultado = adaptarCadastroCompleto({
    ...entrada,
    medicos: entrada.medicos.map((m) => ({ ...m, ativo: true })),
    procedimentos: entrada.procedimentos.map((p) => ({ ...p, ativo: true })),
    especialidadesMedicos: [{ medico_id: "joao", especialidade_id: "oftalmo" }],
  });
  const consulta = resultado.find((r) => r.tipo === "profissional")!.fonte;
  const exame = resultado.find((r) => r.tipo === "servico")!.fonte;
  expect(JSON.stringify(consulta)).not.toContain("Quarta-feira");
  expect(consulta.observacao_publica).toContain("Quinta-feira 09:30–17:00");
  expect(exame.executantes[0].horarios).toContain("Quarta-feira");
  expect(exame.executantes[0].observacao).not.toContain("CONSULTAS");
  expect(consulta.formas_pagamento.map((f: any) => f.valor)).toEqual([120, 145]);
});

test("vínculo por ID do procedimento prevalece sobre nome da agenda e não empresta horários", () => {
  const e = {
    ...entrada,
    agendas: entrada.agendas.map((a) => ({
      ...a,
      nome: "Agenda especial",
      medico_agenda_procedimentos: [{ procedimento_id: a.id === "c" ? "consulta" : "exame" }],
    })),
  };
  expect(mapearProfissionais(e)[0]!.observacao_publica).not.toContain("Quarta-feira");
  expect(JSON.stringify(mapearProfissionais(e)[0]!.horarios)).not.toContain("Quarta-feira");
  expect(JSON.stringify(mapearServicos(e))).toContain("Quarta-feira");
  expect(horariosDoMedico("joao", e, "consulta", "revisao-sem-vinculo")).toEqual([]);
  const nomeDivergente = { ...e, agendas: e.agendas.map((a) => ({ ...a, nome: "EXAMES" })) };
  const publicado = mapearProfissionais(nomeDivergente)[0]!;
  const horarios = horarioSchema.array().parse(publicado.horarios);
  expect(profissionalParaRegistro({ ...publicado, horarios }, entrada.hojeISO).dia).toContain(
    "Quinta-feira",
  );
});

test("leitura da Base corrige resumo misturado legado sem escrever nem perder preço", () => {
  const horarios = horariosDoMedico("joao", entrada);
  const original = mapearProfissionais(entrada)[0]!;
  const p = {
    ...original,
    horarios,
    observacao_publica: original.observacao_publica!.replace(
      /^Dias e horários:.*$/gm,
      `Dias e horários: ${resumoHorarios(horarios as never)}`,
    ),
  };
  const antes = structuredClone(p);
  const r = profissionalParaRegistro(p, entrada.hojeISO, { atendimento: "Oftalmologia" });
  expect(JSON.stringify(r)).not.toContain("Quarta-feira");
  expect(r.preco_dinheiro).toBe(120);
  expect(r.preco_cartao).toBe(145);
  expect(p).toEqual(antes);
});

test("exame legado mantém apenas seus horários, sem aplicar escala de consulta do executante", () => {
  const s = mapearServicos(entrada)[0]!;
  // A consulta tinha também sábado; o exame somente quarta, com observações de agenda explícitas.
  const antigos = "Sábado 08:00–09:00 · Quarta-feira 09:30–17:00";
  const legado = {
    ...s,
    executantes: [
      {
        nome: "João Hélio",
        horarios: antigos,
        observacao:
          "Sábado 08:00–09:00: Agenda: CONSULTAS\nQuarta-feira 09:30–17:00: Agenda: EXAMES",
      },
    ],
    descricao_publica: `EXAME OCULAR\nEspecialidade: OFTALMOLOGIA\nProfissional: João Hélio\nDias e horários: ${antigos}`,
  };
  const antes = structuredClone(legado);
  const r = servicoParaRegistro(legado);
  expect(JSON.stringify(r)).not.toContain("Sábado");
  expect(r.dia).toBe("Quarta-feira 09:30–17:00");
  expect(legado).toEqual(antes);
});

test("texto editorial distinto e escala sem rótulo explícito não são sobrescritos", () => {
  const p = mapearProfissionais(entrada)[0]!;
  const obs = p.observacao_publica!.replace(
    /^Dias e horários:.*$/gm,
    "Dias e horários: Quinta-feira 10:00–12:00",
  );
  const r = profissionalParaRegistro(
    { ...p, horarios: horariosDoMedico("joao", entrada), observacao_publica: obs },
    entrada.hojeISO,
  );
  expect(r.extras?.observacao_publica).toBe(obs);
  const geral = { ...entrada, agendas: entrada.agendas.map((a) => ({ ...a, nome: "Geral" })) };
  expect(mapearProfissionais(geral)[0]!.observacao_publica).toContain("Quarta-feira");
});
