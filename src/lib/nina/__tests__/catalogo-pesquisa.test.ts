import { describe, expect, it } from "bun:test";
import { recusarFraseComoPesquisa, PESQUISA_NAO_INTERPRETADA } from "../catalogo-pesquisa";
import { criarToolBroker } from "../tool-broker.server";
import { encaminhamentoSemRegistro } from "../catalogo-sem-registro";
import { encaminharAposEsclarecimento } from "../catalogo-esclarecimento";

describe("pesquisa usa atendimento, não texto conversacional", () => {
  it.each([
    "Boa tarde, Nina. Gostaria de agendar uma consulta com cardiologista nos próximos dias.",
    "Qual o valor de cardiologia?",
    "Como funciona o atendimento para nebulização?",
    "Quero uma ultra de abdome total sem doppler",
    "Tem cardiologista amanhã?",
    "Clínica Médica",
    "consulta clinica medica",
  ])("recusa a frase antes de consultar: %s", async (termo) => {
    let consultas = 0;
    const broker = criarToolBroker({
      ctxPaciente: {
        clinicaId: "teste",
        telefone: null,
        pacienteId: null,
        pacienteNome: null,
        conversaId: null,
        origem: "homologacao",
      },
      ctxHandoff: { clinicaId: "teste", conversaId: null },
      executarPaciente: async () => {
        consultas++;
        return { ok: true };
      },
    });
    const r = await broker.executar("consultar_base_conhecimento", JSON.stringify({ termo }));
    expect(consultas).toBe(0);
    expect(r.success).toBe(false);
    expect(r.dados).toMatchObject({ codigo: PESQUISA_NAO_INTERPRETADA, consulta_executada: false });
    expect(encaminhamentoSemRegistro(r, { termo })).toBeNull();
    expect(
      encaminharAposEsclarecimento(
        {
          versao: 1,
          clinicaId: "teste",
          sessionId: "sessao",
          consulta: { termo: "USG" },
          referencias: [],
          esclarecimento: { tipo: "procedimento", pergunta: "Qual exame?", opcoes: [] },
        },
        r,
        termo,
      ),
    ).toBeNull();
  });
  it.each([
    "cardiologia",
    "Clínico Geral",
    "cardiologia infantil",
    "nebulização",
    "USG abdome total sem doppler",
    "Tomografia de abdome superior com e sem contraste",
    "Dr. João Hélio",
    "XYZ",
    "horário de funcionamento",
    "convênios aceitos",
  ])("preserva nome, qualificadores e siglas a esclarecer: %s", (termo) => {
    expect(recusarFraseComoPesquisa("consultar_base_conhecimento", { termo })).toBeNull();
  });
  it("aplica a validação também aos atalhos de busca, sem bloquear o motivo de uma transferência legítima", () => {
    expect(recusarFraseComoPesquisa("buscar_medicos", { especialidade: "Clínica Médica", nome: "Dra. Ana" }))
      .toMatchObject({ codigo: PESQUISA_NAO_INTERPRETADA, consulta_executada: false });
    expect(recusarFraseComoPesquisa("dados_da_clinica", { clinica: "Clínica Médica" })).toBeNull();
    expect(
      recusarFraseComoPesquisa("buscar_medicos", { especialidade: "Quero cardiologista" }),
    ).not.toBeNull();
    expect(
      recusarFraseComoPesquisa("buscar_procedimentos", { termo: "Gostaria de fazer ECG" }),
    ).not.toBeNull();
    expect(
      recusarFraseComoPesquisa("solicitar_atendente_humano", {
        motivo: "Quero falar com atendente",
      }),
    ).toBeNull();
  });
});
