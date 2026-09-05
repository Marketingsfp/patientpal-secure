import { describe, expect, it } from "bun:test";
import { blocosVisiveis, normalizarResumo } from "./handoff-resumo";

describe("normalizarResumo", () => {
  it("descarta placeholders e campos vazios", () => {
    const r = normalizarResumo({
      intencao: "agendamento",
      motivo_contato: "  Quer agendar  consulta  ",
      informacoes: ["Nome: João", "", "não informado", "Nome: João"],
      ja_informado: "n/a",
      pendencias: [],
      proxima_acao: "-",
      situacao: "",
    });
    expect(r.informacoes).toEqual(["Nome: João"]);
    expect(r.ja_informado).toEqual([]);
    expect(r.proxima_acao).toBeNull();
    expect(r.situacao).toBeNull();
    expect(r.motivo_contato).toBe("Quer agendar consulta");
  });

  it("ignora agendamento inventado pela IA e usa só o registro real", () => {
    const semReal = normalizarResumo({
      intencao: "agendamento",
      agendamento_confirmado: { medico: "Dr. Fantasma", data: "10/10" },
    });
    expect(semReal.agendamento_confirmado).toBeNull();

    const comReal = normalizarResumo(
      { intencao: "agendamento" },
      { agendamentoReal: { medico: "Dra. Valeria", data: "05/09/2026", hora: "09:00" } },
    );
    expect(comReal.agendamento_confirmado?.medico).toBe("Dra. Valeria");
  });

  it("cai para 'outro' quando a intenção é desconhecida", () => {
    expect(normalizarResumo({ intencao: "teletransporte" }).intencao).toBe("outro");
  });

  it("prioriza o motivo real da transferência", () => {
    const r = normalizarResumo(
      { motivo_handoff: "chute do modelo" },
      { motivoHandoff: "Paciente pediu atendente" },
    );
    expect(r.motivo_handoff).toBe("Paciente pediu atendente");
  });
});

describe("blocosVisiveis", () => {
  it("não cria bloco para lista vazia", () => {
    const r = normalizarResumo({ intencao: "valores", motivo_contato: "Quer saber o preço" });
    const titulos = blocosVisiveis(r).map((b) => b.titulo);
    expect(titulos).toEqual(["Motivo do contato"]);
  });
});
