import { describe, expect, it } from "bun:test";
import { confirmarProfissionalDaPergunta, prepararPesquisaMedicoDaSessao } from "../pesquisa-medico-sessao";
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

const pergunta = "Você se refere a este profissional?\nSandro Prinscewal — CARDIOLOGIA, CLINICO GERAL";
const pendente: ConhecimentoSessao = {
  ...anterior, consulta: { termo: "clinica medica", tipo_atendimento: "consulta" },
  referencias: [{ registro: "sandro", versao: "1", procedimento: null, medicoNome: "Sandro Prinscewal" }],
  esclarecimento: { tipo: "profissional", pergunta, opcoes: [{ id: "sandro", nome: "Sandro Prinscewal", especialidade: "CARDIOLOGIA, CLINICO GERAL" }] },
};
const contexto = (mensagem: string, content = pergunta) => ({ mensagem, historico: [{ role: "assistant", content }] });
describe("confirmação da única opção realmente apresentada", () => {
  it("concordância com pergunta negativa exige esclarecer o sentido", () => {
    const perguntaNegativa = "Você não quer Sandro Prinscewal?";
    const negativa = { ...pendente, esclarecimento: { ...pendente.esclarecimento!, pergunta: perguntaNegativa } };
    expect(confirmarProfissionalDaPergunta(negativa, contexto("sim", perguntaNegativa))).toBeNull();
    expect(confirmarProfissionalDaPergunta(negativa, contexto("já é", perguntaNegativa))).toBeNull();
  });
  it.each(["já é", "formou", "demorou", "combinado", "tá ok"])("concordância informal exige um médico único e pergunta entregue: %s", mensagem => {
    expect(confirmarProfissionalDaPergunta(pendente, contexto(mensagem))?.registro).toBe("sandro");
    expect(confirmarProfissionalDaPergunta(pendente, { mensagem, historico: [] })).toBeNull();
    expect(confirmarProfissionalDaPergunta({ ...pendente, esclarecimento: {
      ...pendente.esclarecimento!, opcoes: [...pendente.esclarecimento!.opcoes, { id: "outro", nome: "Outro médico" }],
    } }, contexto(mensagem))).toBeNull();
  });
  it.each(["nn", "quero não", "esse msm nn", "formou, mas outro médico", "ainda", "pdc", "valeu"])("não escolhe médico por recusa ou ciência: %s", mensagem => {
    expect(confirmarProfissionalDaPergunta(pendente, contexto(mensagem))).toBeNull();
  });
  it.each(["Isso", "esse mesmo", "esse", "sim", "Confirmo", "é esse", "esse msm", "ss", "s", "simmm!", "isssooo", "isso aí", "é ele", "aham", "uhum", "blz", "fechou", "Sim, por favor!"])("identifica Sandro e preserva a consulta: %s", mensagem => {
    const r = JSON.parse(prepararPesquisaMedicoDaSessao("consultar_base_conhecimento", '{"termo":"Sandro","medico":"Sandro"}', pendente, contexto(mensagem))!);
    expect(r).toMatchObject({ termo: "clinica medica", medico: "sandro", tipo_atendimento: "consulta", nova_solicitacao: false });
    expect(confirmarProfissionalDaPergunta(pendente, contexto(mensagem))?.registro).toBe("sandro");
  });
  it.each(["Não é esse", "esse não", "sim, mas quero outro", "isso?", "talvez", "pode ser se atender amanhã", "sim, qual valor?", "sei lá", "blz, vou pensar", "nn", "isso ou outro", "sim 👎"])("não trata recusa, pergunta ou condição como aceite: %s", mensagem => {
    expect(confirmarProfissionalDaPergunta(pendente, contexto(mensagem))).toBeNull();
  });
  it("não escolhe entre duas opções nem usa pergunta antiga/sem entrega", () => {
    expect(confirmarProfissionalDaPergunta({ ...pendente, esclarecimento: { ...pendente.esclarecimento!, opcoes: [...pendente.esclarecimento!.opcoes, { id: "outro", nome: "Sandro Souza" }] } }, contexto("isso"))).toBeNull();
    expect(confirmarProfissionalDaPergunta(pendente, contexto("isso", `${pergunta}\nVocê prefere amanhã ou sexta?`))).toBeNull();
    expect(confirmarProfissionalDaPergunta(pendente, { mensagem: "isso", historico: [] })).toBeNull();
    expect(confirmarProfissionalDaPergunta(pendente, { mensagem: "isso", historico: [{ role: "user", content: pergunta }] })).toBeNull();
    expect(confirmarProfissionalDaPergunta({ ...pendente, referencias: [] }, contexto("isso"))).toBeNull();
    expect(confirmarProfissionalDaPergunta(null, contexto("isso"))).toBeNull();
  });
  it("também prepara buscar_medicos pelo ID, sem unir as especialidades do médico", () => {
    const r = JSON.parse(prepararPesquisaMedicoDaSessao("buscar_medicos", '{"nome":"Sandro"}', pendente, contexto("esse mesmo"))!);
    expect(r).toEqual({ nome: "sandro", especialidade: "clinica medica" });
  });
});
