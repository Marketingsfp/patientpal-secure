import { describe, expect, it } from "bun:test";
import { preservarFinalidadeVacina, registroVacinaGripe } from "../finalidade-vacina";
import { criarPerguntasDoTurno, comporRespostaParcial } from "../perguntas-independentes";
import { confirmarAntesDeEncaminhar, encaminhamentoSemRegistro } from "../catalogo-sem-registro";
import { encaminharAposEsclarecimento } from "../catalogo-esclarecimento";
import type { ResultadoBroker } from "../tool-broker";
import type { ConhecimentoSessao } from "../confidence/conhecimento-sessao";

const mensagem =
  "oi, vcs faz teste de dna de paternidade? e vacina da gripe tem? e o pix pode paga na hora la ou so antes?";
const preparar = (termo: string, texto = mensagem) =>
  JSON.parse(
    preservarFinalidadeVacina(
      "buscar_procedimentos",
      JSON.stringify({ termo, nova_solicitacao: true }),
      texto,
    )!,
  );
const limitacao: ResultadoBroker = {
  ferramenta: "consultar_cadastro",
  capacidade: "searchKnowledgeBase",
  fonte: "base_conhecimento",
  success: true,
  reused: false,
  appointment_confirmed: false,
  dados: {
    found: false,
    knowledge_status: "not_found",
    records: [],
    limitacao_catalogo: {
      codigo: "VACINA_ESPECIFICA_NAO_CONFIRMADA",
      pedido: "vacina da gripe",
      mensagem: "O cadastro não permite confirmar essa vacina.",
    },
  },
};
const pendencia = (termo: string): ConhecimentoSessao =>
  ({
    clinicaId: "c",
    sessionId: "s",
    consulta: { termo },
    referencias: [],
    esclarecimento: { tipo: "procedimento", pergunta: `Você se refere a ${termo}?`, opcoes: [] },
  }) as unknown as ConhecimentoSessao;

describe("finalidade de vacinação", () => {
  for (const termo of ["VACINA", "gripe", "influenza", "PCR influenza"])
    it(`preserva o pedido ao pesquisar ${termo}, inclusive nova_solicitacao equivocada`, () => {
      expect(preparar(termo).termo).toBe("vacina da gripe");
      expect(preparar(termo).tipo_atendimento).toBe("exame_procedimento");
    });
  it("preserva outros pedidos e teste diagnóstico explicitamente solicitado", () => {
    expect(preparar("DNA paternidade").termo).toBe("DNA paternidade");
    expect(preparar("vacina hepatite B").termo).toBe("vacina hepatite B");
    expect(preparar("PCR influenza", "quero PCR influenza e vacina da gripe").termo).toBe(
      "PCR influenza",
    );
    expect(preparar("influenza", "preciso de exame de influenza").termo).toBe("influenza");
    expect(preparar("VACINA", "vacina da gripe quadrivalente tem?").termo).toBe(
      "vacina da gripe quadrivalente",
    );
    expect(preparar("VACINA", "vacina da gripe para idosos tem?").termo).toBe(
      "vacina da gripe para idosos",
    );
  });
  it("não transforma título genérico ou alias de PCR em vacina confirmada", () => {
    expect(registroVacinaGripe("VACINA", [])).toBe(false);
    expect(registroVacinaGripe("PCR INFLUENZA", ["vacina da gripe"])).toBe(false);
    expect(registroVacinaGripe("VACINA", ["vacina da gripe"])).toBe(true);
    expect(registroVacinaGripe("VACINA INFLUENZA", [])).toBe(true);
  });
  it("limitação de conteúdo não pede nova escrita nem aciona segunda falha", () => {
    expect(confirmarAntesDeEncaminhar(limitacao, { termo: "vacina da gripe" }, null)).toBe(
      limitacao,
    );
    expect(encaminhamentoSemRegistro(limitacao, {})).toBeNull();
    expect(
      encaminharAposEsclarecimento(pendencia("vacina da gripe"), limitacao, "isso"),
    ).toBeNull();
  });
  it("remove pendências antigas do mesmo pedido, preservando dúvidas independentes", () => {
    const anteriores = ["VACINA", "gripe", "influenza", "DNA"].map(pendencia);
    const turno = criarPerguntasDoTurno(
      { ...anteriores[0]!, pendenciasIdentificacao: anteriores },
      mensagem,
    );
    turno.reconciliar({ termo: "vacina da gripe" }, limitacao);
    expect(turno.pendentes.map((p) => p.consulta.termo)).toEqual(["DNA"]);
    const texto = comporRespostaParcial(
      "Não posso confirmar a vacina da gripe pelo cadastro. Pix antecipado.",
      turno.pendentes,
    );
    expect(texto.match(/vacina da gripe/g)).toHaveLength(1);
    expect(texto).not.toContain("Você se refere a VACINA");
  });
  it("falha técnica não apaga pendência", () => {
    const turno = criarPerguntasDoTurno(pendencia("vacina da gripe"), mensagem);
    turno.reconciliar({}, { ...limitacao, success: false, erro: "TIMEOUT", dados: null });
    expect(turno.pendentes).toHaveLength(1);
  });
  it("não apaga diagnóstico pedido separadamente na mesma mensagem", () => {
    const anteriores = ["vacina da gripe", "influenza"].map(pendencia);
    const turno = criarPerguntasDoTurno(
      { ...anteriores[0]!, pendenciasIdentificacao: anteriores },
      "Quero vacina da gripe e teste de influenza",
    );
    turno.reconciliar({ termo: "vacina da gripe" }, limitacao);
    expect(turno.pendentes.map((p) => p.consulta.termo)).toEqual(["influenza"]);
  });
});
