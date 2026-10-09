import { describe, expect, it } from "bun:test";
import { apresentarIdadeMinima, resultadoExigeHumano } from "../regras-catalogo";
import { servicoParaRegistro, profissionalParaRegistro } from "../catalogo-conhecimento";
import { textoDaChave } from "../resposta/templates";
import { comporRequestNina } from "../prompt-composer";
import { handoffSemAviso, resultadoHandoffSilencioso } from "../handoff-silencioso";

describe("separação entre fatos, prompt e execução", () => {
  it("SFP e nomes de equipe chegam literais ao modelo sem decidir conduta", () => {
    for (const nome of ["SFP", "SPF", "TÉCNICA", "Enfermagem", "MAMOGRAFIA", "Dra. Ana"]) {
      const r = servicoParaRegistro({
        id: "e",
        nome: "Exame",
        executantes: [{ nome }],
        formas_pagamento: [],
      } as any);
      expect(r.medico).toBe(nome);
      expect(r.extras?.atendimento_humano_obrigatorio).toBe(false);
      expect(r.extras?.omitir_nome_profissional).toBeUndefined();
      expect(resultadoExigeHumano({ records: [r] })).toBe(false);
      const p = profissionalParaRegistro({ id: "p", nome, horarios: [] } as any, "2026-10-04");
      expect(resultadoExigeHumano({ records: [p] })).toBe(false);
      const req = comporRequestNina({
        behaviorPrompt: "Apresente conforme estas instruções.",
        runtimeContext: { medico: nome },
      });
      expect(req.runtimeContext.medico).toBe(nome);
    }
  });
  it("preserva uma restrição humana explícita do cadastro sem deduzir pelo nome", () => {
    const records = [
      { id: "sfp", medico: "SFP" },
      { id: "a", medico: "Ana", extras: { atendimento_humano_obrigatorio: true } },
    ];
    expect(resultadoExigeHumano({ records })).toBe(false);
    expect(resultadoExigeHumano({ records }, ["sfp"])).toBe(false);
    expect(resultadoExigeHumano({ records }, ["a"])).toBe(true);
    expect(resultadoExigeHumano({ erro: "PROFISSIONAL_SFP" })).toBe(false);
  });
  it("template não apaga nomes nem troca a antecedência publicada e continua retirando emojis", () => {
    const chave = "fluxo.agendamento.revisar";
    const texto =
      "{profissional}: {procedimento}, {data}, {horario}, {unidade}. Chegue 15 minutos antes. 😊";
    const r = textoDaChave(
      chave,
      {
        profissional: "Enfermagem",
        procedimento: "Exame",
        data: "05/10",
        horario: "08h",
        unidade: "Clínica",
      },
      { [chave]: texto },
    );
    expect(r.texto).toContain("Enfermagem");
    expect(r.texto).toContain("15 minutos");
    expect(r.texto).not.toContain("30 minutos");
    expect(r.texto).not.toContain("😊");
  });
  it("silêncio depende de opção explícita, não do motivo ou nome", () => {
    expect(handoffSemAviso({ avisar_paciente: true }, "PROFISSIONAL_SFP")).toBe(false);
    expect(handoffSemAviso({ avisar_paciente: false }, "Conferência")).toBe(true);
    expect(handoffSemAviso({ avisar_paciente: false }, "[Outra unidade] PROFISSIONAL_SFP")).toBe(
      true,
    );
    expect(handoffSemAviso({}, "PROFISSIONAL_SFP")).toBe(true);
    expect(handoffSemAviso({}, "Paciente pediu humano")).toBe(false);
    expect(resultadoHandoffSilencioso()).toMatchObject({ estado: "descartar", texto: "" });
  });
  it("mantém a regra de idade que não faz parte desta alteração", () => {
    expect(apresentarIdadeMinima("Idade: 18 anos")).toBe("Idade: a partir de 18 anos");
    expect(apresentarIdadeMinima("Jejum: 8 horas; R$ 18,00")).toBe("Jejum: 8 horas; R$ 18,00");
  });
});
