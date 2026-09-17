import { describe, expect, it } from "bun:test";
import {
  atualizarInteresseConsultaAgenda,
  autorizarConsultaAgenda,
  interesseEmConsultarAgenda,
  normalizarInteresseConsultaAgenda,
  type ContextoConsultaAgenda,
} from "../consulta-agenda";
import { resolverSelecaoContextual } from "../confidence/selecao-contextual";
import type { FatoRecuperado } from "../confidence/evidencia";

const CLINICA = "clinica-a",
  SESSAO = "sessao-a";
const ALEX = { id: "11111111-1111-4111-8111-111111111111", nome: "ALEX LOUZA" };
const BRUNO = { id: "22222222-2222-4222-8222-222222222222", nome: "Bruno Costa" };
const fatos: FatoRecuperado[] = [
  {
    consulta: "consultar_base_conhecimento",
    capacidade: "searchKnowledgeBase",
    entidade: "profissional",
    campo: "nome",
    valor: "Alex Louza",
    registro: "nina_cat_profissionais:alex-publicado",
    fonte: "catalogo_publicado",
    clinicaId: CLINICA,
    versao: "v1",
    chave: {
      medicoNome: "Alex Louza",
      procedimento: "Consulta — CARDIOLOGIA, CARDIOLOGIA INFANTIL",
    },
  },
];
const oferta = {
  id: "oferta-1",
  role: "assistant",
  content:
    "Dr. Alex Louza e Dr. Bruno Costa atendem na clínica. Qual médico prefere para verificar vagas?",
};
const escolha = { id: "paciente-2", role: "user", content: "vou fazer com o dr Alex" };
const pergunta = {
  id: "modalidade-3",
  role: "assistant",
  content: "Você prefere Cardiologia ou Cardiologia Infantil, e qual dia deseja?",
};
const preferencia = resolverSelecaoContextual({
  mensagem: escolha.content,
  clinicaId: CLINICA,
  sessaoId: SESSAO,
  fatosOficiais: fatos,
}).selecao!;
const inicio: ContextoConsultaAgenda = {
  mensagemAtual: escolha.content,
  mensagemAtualId: escolha.id,
  historico: [oferta],
  clinicaId: CLINICA,
  sessaoId: SESSAO,
  selecaoRevalidada: preferencia,
};
const interesse = atualizarInteresseConsultaAgenda(inicio)!;

function contexto(
  mensagemAtual = "cardiologia quarta",
  extra: Partial<ContextoConsultaAgenda> = {},
): ContextoConsultaAgenda {
  const selecaoRevalidada = resolverSelecaoContextual({
    mensagem: mensagemAtual,
    clinicaId: CLINICA,
    sessaoId: SESSAO,
    fatosOficiais: fatos,
    selecaoAnterior: preferencia,
  }).selecao;
  return {
    mensagemAtual,
    mensagemAtualId: "paciente-4",
    historico: [oferta, escolha, pergunta],
    clinicaId: CLINICA,
    sessaoId: SESSAO,
    selecaoRevalidada,
    interesseAnterior: interesse,
    ...extra,
  };
}

describe("continuidade da autorização de leitura da agenda", () => {
  it("registra a escolha após oferta composta e revalida o sim ao médico escolhido", () => {
    const composta = { ...oferta, content: "Gostaria de verificar vagas na agenda? Se sim, qual profissional prefere?" };
    const prova = atualizarInteresseConsultaAgenda({ ...inicio, historico: [composta] });
    expect(prova).toMatchObject({ mensagemPacienteId: escolha.id, ofertaMensagemId: composta.id,
      referenciaProfissional: preferencia.referenciaProfissional });
    const ctx = contexto("sim", {
      historico: [composta, escolha, { id: "confirmacao-consulta", role: "assistant",
        content: "Gostaria que eu consulte vagas e horários disponíveis na agenda para a sua consulta com ele?" }],
      interesseAnterior: prova,
    });
    expect(autorizarConsultaAgenda(ctx, ALEX, [ALEX, BRUNO]).permitido).toBe(true);
    expect(autorizarConsultaAgenda(ctx, BRUNO, [ALEX, BRUNO]).permitido).toBe(false);
    expect(atualizarInteresseConsultaAgenda(ctx)).toMatchObject({ mensagemPacienteId: "paciente-4",
      ofertaMensagemId: "confirmacao-consulta", referenciaProfissional: preferencia.referenciaProfissional });
  });
  it("registra o aceite da oferta pela mensagem paciente e pelo ID da oferta", () => {
    expect(interesse).toMatchObject({
      versao: 1,
      clinicaId: CLINICA,
      sessaoId: SESSAO,
      mensagemPacienteId: escolha.id,
      ofertaMensagemId: oferta.id,
    });
    expect(interesse).not.toHaveProperty("appointmentCreated");
    expect(interesse).not.toHaveProperty("bookingIntentConfirmed");
  });

  it("mantém leitura após escolha de modalidade/dia com UUID diferente do catálogo", () => {
    const ctx = contexto();
    expect(ctx.selecaoRevalidada?.medicoId).toBeNull();
    expect(interesseEmConsultarAgenda(ctx)).toBe(true);
    expect(autorizarConsultaAgenda(ctx, ALEX, [ALEX, BRUNO]).permitido).toBe(true);
    expect(autorizarConsultaAgenda(ctx, BRUNO, [ALEX, BRUNO]).permitido).toBe(false);
    expect(atualizarInteresseConsultaAgenda(ctx)).toEqual(interesse);
  });

  it("continua por mais uma pergunta de período sem criar novo aceite", () => {
    const ctx = contexto("à tarde", {
      historico: [
        oferta,
        escolha,
        pergunta,
        { id: "paciente-4", role: "user", content: "cardiologia quarta" },
        { id: "periodo-5", role: "assistant", content: "Qual período você prefere?" },
      ],
      mensagemAtualId: "paciente-6",
      selecaoRevalidada: contexto().selecaoRevalidada,
    });
    expect(interesseEmConsultarAgenda(ctx)).toBe(true);
    expect(atualizarInteresseConsultaAgenda(ctx)).toEqual(interesse);
  });

  it.each(["quarta?", "cardiologia quarta", "infantil quarta"])(
    "aceita somente complemento ligado à pergunta entregue: %s",
    (mensagem) => {
      expect(autorizarConsultaAgenda(contexto(mensagem), ALEX, [ALEX, BRUNO]).permitido).toBe(true);
    },
  );

  it.each([
    "não quero consultar a agenda",
    "agora não",
    "qual o preço?",
    "só quero saber os horários de atendimento",
    "quero informações do dr Alex",
    "infantil, mas não consulte a agenda",
    "qual o preparo?",
  ])("não herda autorização quando paciente recusa ou muda pedido: %s", (mensagem) => {
    const ctx = contexto(mensagem);
    expect(interesseEmConsultarAgenda(ctx)).toBe(false);
    expect(atualizarInteresseConsultaAgenda(ctx)).toBeNull();
  });

  it("negação de modalidade seguida da escolha não é recusa da agenda", () => {
    const mensagem = "não infantil, cardiologia quarta";
    const ctx = contexto(mensagem);
    expect(interesseEmConsultarAgenda(ctx)).toBe(true);
    expect(autorizarConsultaAgenda(ctx, ALEX, [ALEX, BRUNO]).permitido).toBe(true);
  });

  it("uma recusa histórica entre o aceite e o novo complemento invalida a origem", () => {
    const ctx = contexto("quarta", {
      historico: [
        oferta,
        escolha,
        { id: "recusa", role: "user", content: "não quero consultar a agenda" },
        pergunta,
      ],
    });
    expect(interesseEmConsultarAgenda(ctx)).toBe(false);
    expect(atualizarInteresseConsultaAgenda(ctx)).toBeNull();
  });

  it("um booleano ou interesse sem mensagens de origem não é prova", () => {
    expect(normalizarInteresseConsultaAgenda(true)).toBeNull();
    for (const ctx of [
      contexto("quarta", { historico: [pergunta] }),
      contexto("quarta", { interesseAnterior: null }),
      contexto("quarta", { interesseAnterior: { ...interesse, mensagemPacienteId: "inventada" } }),
    ]) {
      expect(interesseEmConsultarAgenda(ctx)).toBe(false);
      expect(atualizarInteresseConsultaAgenda(ctx)).toBeNull();
    }
  });

  it("rejeita oferta diferente e mensagem de aceite duplicada no histórico", () => {
    for (const historico of [
      [{ ...oferta, id: "outra" }, escolha, pergunta],
      [oferta, escolha, escolha, pergunta],
    ]) {
      expect(interesseEmConsultarAgenda(contexto("quarta", { historico }))).toBe(false);
    }
  });

  it("IDs corretos com conteúdo de recusa não recriam consentimento", () => {
    const ctx = contexto("quarta", {
      historico: [oferta, { ...escolha, content: "não quero vagas" }, pergunta],
    });
    expect(interesseEmConsultarAgenda(ctx)).toBe(false);
  });

  it("não vincula prova de pedido sobre outro médico ao snapshot atual", () => {
    const ctx = contexto("quarta", {
      historico: [{ ...escolha, content: "Tem vagas com o Dr. Bruno?" }, pergunta],
      interesseAnterior: { ...interesse, ofertaMensagemId: null },
    });
    expect(interesseEmConsultarAgenda(ctx)).toBe(false);
  });

  it("resposta sobre data de nascimento não é complemento de consulta de vagas", () => {
    const ctx = contexto("13/09/1990", {
      historico: [
        oferta,
        escolha,
        { id: "dados", role: "assistant", content: "Qual sua data de nascimento?" },
      ],
    });
    expect(interesseEmConsultarAgenda(ctx)).toBe(false);
  });

  it("não atravessa sessão, clínica, mudança de tema ou outro profissional", () => {
    for (const extra of [
      { sessaoId: "sessao-b" },
      { clinicaId: "clinica-b" },
      { mudancaTema: true },
      { selecaoRevalidada: { ...preferencia, referenciaProfissional: "outro" } },
    ]) {
      expect(interesseEmConsultarAgenda(contexto("quarta", extra))).toBe(false);
    }
  });

  it("médico homônimo na agenda continua exigindo resolução inequívoca", () => {
    const outroAlex = { ...ALEX, id: "33333333-3333-4333-8333-333333333333" };
    expect(autorizarConsultaAgenda(contexto(), ALEX, [ALEX, outroAlex]).permitido).toBe(false);
    expect(
      autorizarConsultaAgenda(contexto(), { ...ALEX, nome: "Alex Silva" }, [ALEX, BRUNO]).permitido,
    ).toBe(false);
  });

  it("horário habitual e profissional selecionado não bastam sem pedido de vagas", () => {
    expect(
      autorizarConsultaAgenda(contexto("quarta 13h", { interesseAnterior: null }), ALEX, [
        ALEX,
        BRUNO,
      ]).permitido,
    ).toBe(false);
    expect(
      autorizarConsultaAgenda(contexto(), { ...ALEX, id: "nina_cat_profissionais:alex" }).permitido,
    ).toBe(false);
  });

  it("aceite genérico de lista não cria prova amarrada ao médico anterior", () => {
    expect(atualizarInteresseConsultaAgenda({ ...inicio, mensagemAtual: "sim" })).toBeNull();
    expect(
      atualizarInteresseConsultaAgenda({ ...inicio, mensagemAtual: "tem vaga com Dr. Bruno?" }),
    ).toBeNull();
    expect(atualizarInteresseConsultaAgenda({ ...inicio, mensagemAtualId: null })).toBeNull();
  });
});
