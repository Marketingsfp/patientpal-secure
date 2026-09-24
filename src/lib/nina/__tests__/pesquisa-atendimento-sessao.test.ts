import { describe, expect, it } from "bun:test";
import { prepararPesquisaAtendimentoDaSessao } from "../pesquisa-atendimento-sessao";
import { recusarFraseComoPesquisa } from "../catalogo-pesquisa";
import type { ConhecimentoSessao } from "../confidence/conhecimento-sessao";

const conhecimento: ConhecimentoSessao = {
  versao: 1, clinicaId: "clinica", sessionId: "sessao",
  consulta: { termo: "Clínico Geral", tipo_atendimento: "consulta" },
  referencias: [{ registro: "milton", versao: "1", procedimento: "Clínico Geral", medicoNome: "Milton Guimarães" }],
};
const contexto = { clinicaId: "clinica", sessionId: "sessao", conhecimento, mensagem: "Quero o Milton Guimarães", historico: [] };
const preparar = (ferramenta: string, args: object, extra = {}) => JSON.parse(prepararPesquisaAtendimentoDaSessao(
  ferramenta, JSON.stringify(args), { ...contexto, ...extra },
)!);

describe("identidade de Clínico Geral nas ferramentas", () => {
  for (const [ferramenta, campo] of [
    ["consultar_base_conhecimento", "termo"], ["buscar_medicos", "especialidade"],
    ["proxima_vaga", "especialidade"], ["consultar_primeiro_disponivel", "especialidade"],
    ["consultar_disponibilidade", "especialidade"], ["verificar_horario", "especialidade"],
  ]) {
    it.each(["Clínica Médica", "Clínica Geral"])(`${ferramenta}: corrige %s a partir do pedido explícito`, termo => {
      const r = preparar(ferramenta!, { [campo!]: termo, medico_id: "carlos", data: "2030-01-21" }, {
        conhecimento: null, mensagem: "Boa tarde, preciso de clínico geral com Carlos Alberto Varillas.",
      });
      expect(r).toEqual({ [campo!]: "Clínico Geral", medico_id: "carlos", data: "2030-01-21" });
      expect(recusarFraseComoPesquisa(ferramenta!, r)).toBeNull();
    });
  }
  it("mantém a especialidade depois de uma pesquisa somente pelo nome", () => {
    expect(preparar("buscar_medicos", { nome: "Milton Guimarães" })).toEqual({ nome: "Milton Guimarães", especialidade: "Clínico Geral" });
    expect(preparar("buscar_medicos", { nome: "Milton Guimarães", especialidade: "Clínica Geral" })).toEqual({ nome: "Milton Guimarães", especialidade: "Clínico Geral" });
  });
  it("mantém Clínico Geral com profissional mulher", () => {
    expect(preparar("buscar_medicos", { nome: "Ana Souza", especialidade: "Clínica Geral" }, {
      conhecimento: null, mensagem: "Quero clínico geral com a Dra. Ana Souza",
    })).toEqual({ nome: "Ana Souza", especialidade: "Clínico Geral" });
  });
  it.each([
    { conhecimento: null, mensagem: "Qual o endereço da clínica médica?" },
    { mensagem: "Quero saber o telefone da clínica médica" },
    { mensagem: "Agora quero cardiologia" },
    { mensagem: "Não quero clínico geral, quero cardiologia" },
    { mensagem: "Quanto custa?", sessionId: "outra-sessao" },
    { mensagem: "Quanto custa?", clinicaId: "outra-clinica" },
    { mensagem: "Quanto custa?", conhecimento: { ...conhecimento, referencias: [] } },
  ])("não converte uma unidade, mudança de pedido ou contexto inválido (%#)", extra => {
    const r = preparar("consultar_base_conhecimento", { termo: "Clínica Médica" }, extra);
    expect(r.termo).toBe("Clínica Médica");
    expect(recusarFraseComoPesquisa("consultar_base_conhecimento", r)).toMatchObject({ consulta_executada: false });
  });
  it("não recupera especialidade anterior em nova solicitação", () => {
    expect(preparar("consultar_base_conhecimento", { termo: "Clínica Geral", nova_solicitacao: true }, { mensagem: "Quanto custa?" }).termo).toBe("Clínica Geral");
  });
  it("preserva nova especialidade e os qualificadores", () => {
    for (const termo of ["Cardiologia", "Clínico Geral infantil", "Clínica Geral infantil", "USG com Doppler"])
      expect(preparar("consultar_base_conhecimento", { termo }).termo).toBe(termo);
  });
  it("não altera informações da unidade nem argumentos de escrita", () => {
    for (const nome of ["dados_da_clinica", "agendar", "solicitar_atendente_humano"])
      expect(preparar(nome, { termo: "Clínica Médica" })).toEqual({ termo: "Clínica Médica" });
  });
});
