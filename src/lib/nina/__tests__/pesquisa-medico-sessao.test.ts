import { describe, expect, it } from "bun:test";
import { prepararPesquisaMedicoDaSessao } from "../pesquisa-medico-sessao";
import type { ConhecimentoSessao } from "../confidence/conhecimento-sessao";
const anterior: ConhecimentoSessao = {
  versao: 1, clinicaId: "clinica", sessionId: "sessao", consulta: { termo: "Dermatologia", tipo_atendimento: "consulta" },
  referencias: [{ registro: "shirley", versao: "1", procedimento: "Dermatologia", medicoNome: "Shirley Martins" }],
};
describe("pesquisa do médico preserva o atendimento identificado", () => {
  it.each([
    ["consultar_base_conhecimento", { termo: "Suellen", medico: "Suellen" }, "termo"],
    ["buscar_medicos", { nome: "Suellen" }, "especialidade"],
  ] as const)("reconsulta a especialidade quando %s recebe apenas o nome", (ferramenta, args, campo) => {
    const preparado = JSON.parse(prepararPesquisaMedicoDaSessao(ferramenta, JSON.stringify(args), anterior)!);
    expect(preparado[campo]).toBe("Dermatologia");
    expect(preparado.medico ?? preparado.nome).toBe("Suellen");
  });
  it.each([
    { termo: "Cardiologia", medico: "Suellen" },
    { termo: "Suellen", medico: "Suellen", nova_solicitacao: true },
    { termo: "Suellen", medico: "Suellen", tipo_atendimento: "exame_procedimento" },
    { termo: "Dermatologia" },
  ])("preserva outro atendimento e a busca sem médico (%#)", args => {
    const original = JSON.stringify(args);
    expect(prepararPesquisaMedicoDaSessao("consultar_base_conhecimento", original, anterior)).toBe(original);
  });
  it("não inventa referência se não há contexto da sessão", () => {
    const args = JSON.stringify({ termo: "Suellen", medico: "Suellen" });
    expect(prepararPesquisaMedicoDaSessao("consultar_base_conhecimento", args, null)).toBe(args);
    expect(prepararPesquisaMedicoDaSessao("consultar_base_conhecimento", args, { ...anterior, referencias: [] })).toBe(args);
  });
});
