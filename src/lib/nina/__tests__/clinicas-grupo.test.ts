import { describe, expect, it } from "bun:test";
import {
  CLINICAS_GRUPO,
  consultarDadosClinicasGrupo,
  consultarHorariosClinicasGrupo,
  dadosPublicosClinicaGrupo,
  selecionarClinicasGrupo,
} from "../clinicas-grupo";
import type { CalendarioPublicado } from "../classificador-periodo";

const [mj, sfp, hoje] = CLINICAS_GRUPO;
describe("diretório público confirmado do grupo", () => {
  it.each([
    [mj.id, "Rua Expedicionários, 148", "25520-591", "(21) 2655-1085"],
    [sfp.id, "Avenida Comendador Teles, 2414", "25561-162", "(21) 2699-1990"],
    [hoje.id, "Rua Mercedes, 75", "26325-320", "(21) 97377-5431"],
  ])("preserva endereço, CEP e contato de %s", (id, endereco, cep, telefone) => {
    const r = dadosPublicosClinicaGrupo(id)!;
    expect(r.endereco).toContain(endereco);
    expect(r.endereco).toContain(cep);
    expect(String(r.telefone)).toBe(telefone);
    expect(consultarDadosClinicasGrupo(id)?.clinicas[0].whatsapp_confirmado).toBe(false);
  });
  it.each([
    "sao_francisco_de_paula",
    "São Francisco de Paula",
    "POLICLÍNICA SÃO FRANCISCO DE PAULA",
    "SFP",
  ])("normaliza o nome explícito %s", (nome) => {
    expect(selecionarClinicasGrupo(mj.id, nome)).toEqual([sfp]);
  });
  it("outra unidade e todas retornam somente o conjunto solicitado", () => {
    expect(consultarDadosClinicasGrupo(mj.id, "Clínica Hoje")?.clinicas.map((c) => c.nome)).toEqual(
      [hoje.nome],
    );
    expect(consultarDadosClinicasGrupo(mj.id, "todas")?.clinicas).toHaveLength(3);
    expect(consultarDadosClinicasGrupo(hoje.id)?.clinicas.map((c) => c.nome)).toEqual([hoje.nome]);
  });
  it.each(["filial", "outra clínica", "sao", sfp.id, "desconhecida", { id: sfp.id }])(
    "não adivinha uma referência ambígua ou aceita ID operacional: %p",
    (nome) => {
      expect(consultarDadosClinicasGrupo(mj.id, nome)?.encontrado).toBe(false);
      expect(consultarDadosClinicasGrupo(mj.id, nome)?.clinicas).toEqual([]);
    },
  );
  it("não associa outra organização ao grupo", () => {
    expect(consultarDadosClinicasGrupo("outra-organizacao", "todas")).toBeNull();
    expect(dadosPublicosClinicaGrupo("outra-organizacao")).toBeNull();
  });
  it.each([
    [mj.id, "07:00", "18:00", "18:00", "14:00"],
    [sfp.id, "06:00", "19:00", "21:00", "14:00"],
    [hoje.id, "08:00", "17:00", "17:00", "12:00"],
  ])("confere todos os dias da semana de %s", (id, inicio, fim, quartaFim, sabadoFim) => {
    const r = consultarHorariosClinicasGrupo(id)!;
    if (!("semana" in r)) throw new Error("horário ausente");
    for (const i of [1, 2, 4, 5]) expect(r.semana![i].faixas).toEqual([{ inicio, fim }]);
    expect(r.semana![3].faixas).toEqual([{ inicio, fim: quartaFim }]);
    expect(r.semana![6].faixas).toEqual([{ inicio, fim: sabadoFim }]);
    expect(r.semana![0]).toEqual({ dia: "domingo", fechado: true, faixas: [] });
  });
  it("sem calendário publicado informa a rotina, sem garantir abertura numa data", () => {
    const r = consultarHorariosClinicasGrupo(mj.id, "consulta_hoje", "2026-12-25")!;
    if (!("dia" in r)) throw new Error("horário ausente");
    expect(r.dia?.encontrado).toBe(false);
    expect(r.dia?.fechado).toBeNull();
    expect(r.semana).toHaveLength(7);
  });
  const calendario: CalendarioPublicado = {
    versao_id: "versao-teste",
    versao: 1,
    status: "publicado",
    publicado_em: "2026-09-21T12:00:00Z",
    clinica_id: sfp.id,
    unidade_id: null,
    vigencia_inicio: "2026-09-21",
    fuso: "America/Sao_Paulo",
    dias: [
      { dia_semana: 1, fechado: false, faixas: [{ hora_inicio: "09:00", hora_fim: "15:00" }] },
    ],
    excecoes: [{ data: "2026-12-25", tipo: "fechado" }],
  };
  it("preserva calendário posterior e exceções da clínica escolhida, sem misturar unidades", () => {
    const r = consultarHorariosClinicasGrupo(mj.id, "sao_francisco_de_paula", "2026-12-25", [
      calendario,
    ])!;
    if (!("dia" in r)) throw new Error("horário ausente");
    expect(r.dia).toMatchObject({ encontrado: true, fechado: true, excecao: true });
    expect(r.semana![1].faixas).toEqual([{ inicio: "09:00", fim: "15:00" }]);
    const local = consultarHorariosClinicasGrupo(mj.id, undefined, "2026-12-25", [calendario])!;
    if (!("dia" in local)) throw new Error("horário ausente");
    expect(local.dia?.encontrado).toBe(false);
    expect(local.semana![1].faixas).toEqual([{ inicio: "07:00", fim: "18:00" }]);
  });
  it("não usa a rotina para esconder conflito entre calendários publicados", () => {
    const r = consultarHorariosClinicasGrupo(mj.id, sfp.chave, "2026-12-25", [
      calendario,
      { ...calendario, versao_id: "conflito", versao: 2 },
    ])!;
    if (!("dia" in r)) throw new Error("horário ausente");
    expect(r.dia?.encontrado).toBe(false);
    expect(r.semana).toEqual([]);
  });
});
