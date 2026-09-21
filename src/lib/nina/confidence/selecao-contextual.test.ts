import { describe, expect, it } from "bun:test";
import type { FatoRecuperado } from "./evidencia";
import { montarContextoCanonicoTurno } from "./contexto-turno";
import { detectarIntencoes, intencaoAmbigua } from "../atendimento-fase1";
import {
  candidatosDaSelecaoContextual,
  normalizarSelecaoContextual,
  resolverSelecaoContextual,
  type EntradaSelecaoContextual,
  type SelecaoContextual,
} from "./selecao-contextual";

const CLINICA = "clinica-a";
const SESSAO = "sessao-1";
function profissional(
  nome: string,
  registro: string,
  procedimento: string,
  extra: Partial<FatoRecuperado> = {},
): FatoRecuperado {
  return {
    consulta: "consultar_base_conhecimento",
    capacidade: "searchKnowledgeBase",
    entidade: "profissional",
    campo: "nome",
    valor: nome,
    fonte: "catalogo_publicado",
    registro,
    clinicaId: CLINICA,
    versao: "publicacao-1",
    chave: { medicoNome: nome, procedimento },
    ...extra,
  };
}
const FATOS = [
  profissional(
    "Alex Silva",
    "nina_cat_profissionais:alex",
    "Consulta — CARDIOLOGIA GERAL, CARDIOLOGIA INFANTIL",
  ),
  profissional("Bruno Costa", "nina_cat_profissionais:bruno", "Consulta — DERMATOLOGIA"),
];
function resolver(
  mensagem: string,
  selecaoAnterior: SelecaoContextual | null = null,
  extra: Partial<EntradaSelecaoContextual> = {},
) {
  return resolverSelecaoContextual({
    mensagem,
    clinicaId: CLINICA,
    sessaoId: SESSAO,
    fatosOficiais: FATOS,
    selecaoAnterior,
    agora: "2026-09-13T18:00:00Z",
    ...extra,
  });
}
function alex() {
  return resolver("vou fazer com o dr alex").selecao!;
}

describe("seleção contextual com fatos oficiais reconsultados", () => {
  it("confirmação contextual revalida ID e nome sem autorizar reserva", () => {
    const profissionalConfirmado = { registro: "nina_cat_profissionais:bruno", nome: "Bruno Costa" };
    const r = resolver("isso", null, { profissionalConfirmado });
    expect(r.selecao?.medicoNome).toBe("Bruno Costa");
    expect(r.estado).toBe("selecionado");
    expect(r.aceiteAgendamento).toBe(false);
    expect(resolver("isso", null, { profissionalConfirmado, fatosOficiais: [] }).selecao).toBeNull();
    expect(resolver("isso", null, { profissionalConfirmado: { ...profissionalConfirmado, nome: "Outro nome" } }).selecao).toBeNull();
    expect(resolver("isso", null, { profissionalConfirmado: { ...profissionalConfirmado, registro: "id-obsoleto" } }).selecao).toBeNull();
  });
  it("escolhe Alex único, guarda raízes opacas e pede modalidade sem reservar", () => {
    const r = resolver("vou fazer com o dr alex");
    expect(r.estado).toBe("esclarecer_modalidade");
    expect(r.selecao?.medicoNome).toBe("Alex Silva");
    expect(r.selecao?.medicoId).toBeNull();
    expect(r.selecao?.modalidade).toBeNull();
    expect(r.selecao?.raizesFonte[0]?.registro).toBe("nina_cat_profissionais:alex");
    expect(r.opcoesModalidades.map((m) => m.nome)).toEqual([
      "CARDIOLOGIA GERAL",
      "CARDIOLOGIA INFANTIL",
    ]);
    expect(r.pergunta).toContain("CARDIOLOGIA GERAL ou CARDIOLOGIA INFANTIL");
    expect(r.aceiteAgendamento).toBe(false);
  });

  it("entende infantil no turno seguinte e mantém a seleção vinculada à sessão", () => {
    const r = resolver("infantil", alex());
    expect(r.estado).toBe("selecionado");
    expect(r.selecao?.medicoNome).toBe("Alex Silva");
    expect(r.selecao?.modalidade?.nome).toBe("CARDIOLOGIA INFANTIL");
    expect(r.selecao?.sessaoId).toBe(SESSAO);
    expect(r.aceiteAgendamento).toBe(false);
  });

  it.each(["geral", "a geral", "não infantil, quero geral", "infantil não, geral sim"])(
    "resolve modalidade sem inverter negação contextual: %s",
    (mensagem) => {
      const r = resolver(mensagem, alex());
      expect(r.selecao?.modalidade?.nome).toBe("CARDIOLOGIA GERAL");
      expect(r.aceiteAgendamento).toBe(false);
    },
  );

  it("uma recusa de infantil não escolhe automaticamente geral", () => {
    const r = resolver("não quero infantil", alex());
    expect(r.estado).toBe("esclarecer_modalidade");
    expect(r.selecao?.modalidade).toBeNull();
  });

  it("não escolhe o primeiro Alex quando nomes próprios têm mais de um candidato", () => {
    const r = resolver("vou fazer com o dr alex", null, {
      fatosOficiais: [
        ...FATOS,
        profissional("Alex Souza", "nina_cat_profissionais:alex2", "Consulta Cardiologia"),
      ],
    });
    expect(r.estado).toBe("esclarecer_medico");
    expect(r.selecao).toBeNull();
    expect(r.opcoesMedicos).toHaveLength(2);
  });

  it("nome completo coincidente em IDs diferentes também exige esclarecimento", () => {
    const r = resolver("quero com o dr Alex Silva", null, {
      fatosOficiais: [
        ...FATOS,
        profissional("Alex Silva", "nina_cat_profissionais:homonimo", "Consulta Cardiologia"),
      ],
    });
    expect(r.estado).toBe("esclarecer_medico");
    expect(r.opcoesMedicos).toHaveLength(2);
  });

  it("sobrenome divergente não aproveita o primeiro nome", () => {
    const r = resolver("vou fazer com o dr Alex Santos", alex());
    expect(r.estado).toBe("esclarecer_medico");
    expect(r.motivo).toBe("PROFISSIONAL_NAO_CONFIRMADO");
    expect(r.selecao).toBeNull();
  });

  it("negação do médico escolhido limpa a preferência", () => {
    const r = resolver("não quero com o dr Alex", alex());
    expect(r.estado).toBe("limpo");
    expect(r.selecao).toBeNull();
    expect(r.turnoDeSelecao).toBe(true);
  });

  it("troca explícita considera o médico afirmado depois da recusa", () => {
    const r = resolver("não quero com o dr Alex, prefiro o dr Bruno", alex());
    expect(r.selecao?.medicoNome).toBe("Bruno Costa");
    expect(r.selecao?.modalidade?.nome).toBe("DERMATOLOGIA");
    expect(r.aceiteAgendamento).toBe(false);
  });

  it.each([
    "quero informações do dr Alex",
    "qual o horário do dr Alex?",
    "o dr Alex atende amanhã?",
  ])("pedido informativo não cria preferência ou aceite: %s", (mensagem) => {
    const r = resolver(mensagem);
    expect(r.selecao).toBeNull();
    expect(r.escolhaExplicita).toBe(false);
    expect(r.turnoDeSelecao).toBe(false);
    expect(r.aceiteAgendamento).toBe(false);
  });

  it("informação sobre outro médico não herda a preferência por Alex", () => {
    const r = resolver("qual o horário do dr Bruno?", alex());
    expect(r.selecao).toBeNull();
    expect(r.estado).toBe("limpo");
  });

  it("mudança de tema explícita ou detectada pelo servidor limpa seleção", () => {
    for (const extra of [
      { mensagem: "outro assunto, vocês fazem ultrassom?" },
      { mensagem: "vocês fazem ultrassom?", mudancaTema: true },
    ]) {
      const r = resolver(extra.mensagem, alex(), extra);
      expect(r.estado).toBe("limpo");
      expect(r.selecao).toBeNull();
    }
  });

  it("não carrega preferência entre clínicas ou sessões", () => {
    for (const extra of [{ sessaoId: "sessao-2" }, { clinicaId: "clinica-b" }]) {
      const r = resolver("infantil", alex(), extra);
      expect(r.selecao).toBeNull();
      expect(r.estado).toBe("limpo");
    }
  });

  it("catálogo removido ou sem raízes atuais invalida o snapshot", () => {
    for (const fatosOficiais of [
      [],
      [FATOS[1]!],
      [{ ...FATOS[0]!, registro: undefined }],
      [{ ...FATOS[0]!, clinicaId: undefined }],
    ]) {
      expect(resolver("infantil", alex(), { fatosOficiais }).selecao).toBeNull();
    }
  });

  it("reconsulta atualiza a versão das fontes sem confiar no conteúdo antigo", () => {
    const r = resolver("infantil", alex(), {
      fatosOficiais: FATOS.map((f) => ({ ...f, versao: "publicacao-2" })),
    });
    expect(r.selecao?.raizesFonte[0]?.versao).toBe("publicacao-2");
    expect(r.selecao?.modalidade?.raizesFonte[0]?.versao).toBe("publicacao-2");
  });

  it("fonte de agenda, expirada ou de outra clínica não seleciona profissional", () => {
    for (const extra of [
      { fonte: "agenda" as const },
      { vigenteAte: "2026-09-12T00:00:00Z" },
      { clinicaId: "clinica-b" },
    ]) {
      const r = resolver("vou fazer com o dr Alex", null, {
        fatosOficiais: [{ ...FATOS[0]!, ...extra }],
      });
      expect(r.selecao).toBeNull();
    }
  });

  it("ID conflitante não mantém arbitrariamente o primeiro nome do catálogo", () => {
    const fatos = ["Alex Silva", "Bruno Costa", "Alex Silva"].map((nome) =>
      profissional(nome, "registro", "Cardiologia", {
        chave: { medicoId: "medico-1", medicoNome: nome, procedimento: "Cardiologia" },
      }),
    );
    expect(candidatosDaSelecaoContextual({ clinicaId: CLINICA, fatosOficiais: fatos })).toEqual([]);
  });

  it("um horário de atendimento do médico não cria vaga nem aceite de reserva", () => {
    const selecionado = resolver("geral", alex()).selecao;
    const escala: FatoRecuperado = {
      ...FATOS[0]!,
      entidade: "escala",
      campo: "dia_atendimento",
      valor: "quinta 13:00",
    };
    const r = resolver("quinta às 13h", selecionado, { fatosOficiais: [...FATOS, escala] });
    expect(r.selecao?.medicoNome).toBe("Alex Silva");
    expect(r.aceiteAgendamento).toBe(false);
    expect(r.escolhaExplicita).toBe(false);
    expect(r).not.toHaveProperty("slotSelected");
    expect(r).not.toHaveProperty("appointmentCreated");
  });

  it("normalização JSON preserva somente referências e não capacidades operacionais", () => {
    const r = normalizarSelecaoContextual({
      ...alex(),
      bookingIntentConfirmed: true,
      appointmentCreated: true,
    });
    expect(r).toEqual(alex());
    expect(r).not.toHaveProperty("bookingIntentConfirmed");
    expect(normalizarSelecaoContextual({ medicoNome: "Alex Silva" })).toBeNull();
  });
});

describe("preferência contextual no contexto canônico", () => {
  const deps = { detectarIntencoes, intencaoAmbigua };
  it.each(["vou fazer com o dr alex", "Alex", "o dr Alex", "infantil"])(
    "escolha legível é esclarecimento sem ação executável: %s",
    (mensagem) => {
      const c = montarContextoCanonicoTurno(
        {
          mensagemPaciente: mensagem,
          podeAgendar: true,
          selecaoContextual: resolver(mensagem, mensagem === "infantil" ? alex() : null),
        },
        deps,
      );
      expect(c.turnType).toBe("ESCLARECIMENTO");
      expect(c.intentAmbiguo).toBe(false);
      expect(c.intent).not.toBeNull();
      expect(c.requestedAction).toBeNull();
    },
  );
  it("informação sobre profissional conserva classificação informativa", () => {
    const mensagem = "qual o horário do dr Alex?";
    const c = montarContextoCanonicoTurno(
      { mensagemPaciente: mensagem, podeAgendar: true, selecaoContextual: resolver(mensagem) },
      deps,
    );
    expect(c.turnType).toBe("INFORMACAO");
    expect(c.requestedAction).not.toBe("criar_agendamento");
  });
});
