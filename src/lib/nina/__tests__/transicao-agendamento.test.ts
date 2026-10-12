import { describe, expect, test } from "bun:test";
import {
  REGRA_AGENDAMENTO_POR_ITEM,
  REGRA_TRANSICAO_AGENDAMENTO,
  TRANSICAO_AGENDAMENTO_ATIVA,
  temIntencaoDeAgendar,
} from "../transicao-agendamento";
import {
  PERGUNTA_ENCAMINHAMENTO,
  decidirAgendamentoNoTurno,
  fluxoDoItem,
  fluxoDoRegistro,
  fluxoDosItens,
  modalidadeDoRegistro,
  motivoEhEncaminhamentoDeAgendamento,
  removerPerguntaDeAgendamento,
  respostaAOferta,
} from "../fluxo-agendamento-item";

describe("agendamento controlado pelo catálogo", () => {
  test("a transição continua ativa: a Nina só agenda por item", () => {
    expect(TRANSICAO_AGENDAMENTO_ATIVA).toBe(true);
  });

  test("Jev e leitura determinística distinguem informação de intenção de agendar", () => {
    expect(temIntencaoDeAgendar(["horario", "valor"])).toBe(false);
    expect(temIntencaoDeAgendar(["agendamento"])).toBe(true);
    expect(temIntencaoDeAgendar(["disponibilidade"])).toBe(true);
  });
});

describe("três fluxos por item do catálogo", () => {
  test("hora marcada, chegada com pré-agendamento e ficha agendam quando marcados", () => {
    for (const modalidade of ["hora_marcada", "chegada_com_pre_agendamento", "ficha"] as const) {
      expect(fluxoDoItem({ modalidade, ninaPodeAgendar: true })).toBe("agendar");
      expect(fluxoDoItem({ modalidade, ninaPodeAgendar: false })).toBe("informar_e_encaminhar");
    }
  });

  test("ordem de chegada sem pré-agendamento só informa, mesmo marcada", () => {
    expect(fluxoDoItem({ modalidade: "chegada_sem_pre_agendamento", ninaPodeAgendar: true })).toBe(
      "somente_informar",
    );
    expect(fluxoDoItem({ modalidade: "chegada_sem_pre_agendamento", ninaPodeAgendar: false })).toBe(
      "somente_informar",
    );
  });

  test("modalidade não informada informa e encaminha, mesmo marcada", () => {
    expect(fluxoDoItem({ modalidade: "nao_definida", ninaPodeAgendar: true })).toBe(
      "informar_e_encaminhar",
    );
    expect(fluxoDoItem({ modalidade: null, ninaPodeAgendar: true })).toBe("informar_e_encaminhar");
  });

  test("modalidade vem dos blocos de atendimento; blocos divergentes = não informada", () => {
    expect(
      modalidadeDoRegistro({
        estrutura: { complementos: [{ chave: "a", modalidade: "ficha" }] },
      }),
    ).toBe("ficha");
    expect(
      modalidadeDoRegistro({
        estrutura: {
          complementos: [
            { chave: "a", modalidade: "ficha" },
            { chave: "b", modalidade: "hora_marcada" },
          ],
        },
      }),
    ).toBe("nao_definida");
    expect(modalidadeDoRegistro({ estrutura: {} })).toBe("nao_definida");
    expect(
      fluxoDoRegistro({
        estrutura: {
          nina_pode_agendar: true,
          complementos: [{ chave: "a", modalidade: "hora_marcada" }],
        },
      }),
    ).toBe("agendar");
  });

  test("itens com fluxos diferentes na mesma conversa ficam indefinidos", () => {
    expect(fluxoDosItens([])).toBeNull();
    expect(fluxoDosItens(["agendar", "agendar"])).toBe("agendar");
    expect(fluxoDosItens(["agendar", "somente_informar"])).toBeNull();
  });
});

describe("informar antes de encaminhar", () => {
  const base = {
    intencaoAgendar: true,
    fluxo: "informar_e_encaminhar" as const,
    informacoesEntregues: false,
    ofertaPendente: false,
    respostaOferta: null,
  };

  test("intenção antes das informações: informa e pergunta, não encaminha", () => {
    expect(decidirAgendamentoNoTurno(base)).toBe("oferecer_apos_informar");
  });

  test("intenção depois das informações: encaminha", () => {
    expect(decidirAgendamentoNoTurno({ ...base, informacoesEntregues: true })).toBe("encaminhar");
  });

  test("resposta à pergunta de encaminhamento", () => {
    expect(
      decidirAgendamentoNoTurno({
        ...base,
        intencaoAgendar: false,
        ofertaPendente: true,
        respostaOferta: "aceite",
      }),
    ).toBe("encaminhar");
    expect(
      decidirAgendamentoNoTurno({ ...base, ofertaPendente: true, respostaOferta: "recusa" }),
    ).toBe("seguir");
  });

  test("dúvida sem intenção, ordem de chegada e item agendável seguem com a Nina", () => {
    expect(decidirAgendamentoNoTurno({ ...base, intencaoAgendar: false })).toBe("seguir");
    expect(decidirAgendamentoNoTurno({ ...base, fluxo: "somente_informar" })).toBe("seguir");
    expect(
      decidirAgendamentoNoTurno({ ...base, fluxo: "agendar", informacoesEntregues: true }),
    ).toBe("seguir");
    expect(decidirAgendamentoNoTurno({ ...base, fluxo: null })).toBe("seguir");
  });

  test("lê o sim e o não do paciente à pergunta", () => {
    expect(PERGUNTA_ENCAMINHAMENTO).toBe(
      "Posso encaminhar para nossa equipe confirmar o seu horário?",
    );
    for (const sim of [
      "Sim",
      "pode",
      "Pode sim!",
      "quero",
      "ok",
      "sim, por favor",
      "pode encaminhar",
    ])
      expect(respostaAOferta(sim)).toBe("aceite");
    for (const nao of ["não", "Não, obrigado", "só queria saber", "agora não", "depois"])
      expect(respostaAOferta(nao)).toBe("recusa");
    expect(respostaAOferta("Quanto custa o exame?")).toBeNull();
  });

  test("aceite ou recusa dentro de uma mensagem com outros dados", () => {
    for (const sim of [
      "o paciente é meu filho Paciente Teste, nasceu em 5 de junho de 2022. eu sou a mãe. pode encaminhar sim, mas fica no nome dele, tá?",
      "Meu nome é Paciente Teste, pode sim",
      "sim, pode transferir. É para sábado de manhã",
      "encaminha sim, obrigada",
      "quero marcar sim, é para mim mesmo",
    ])
      expect(respostaAOferta(sim)).toBe("aceite");
    for (const nao of [
      "obrigada pelas informações, não precisa encaminhar",
      "por enquanto não quero marcar, só queria o valor",
      "pode deixar, não me transfere agora",
    ])
      expect(respostaAOferta(nao)).toBe("recusa");
    expect(respostaAOferta("Tem atendimento no sábado de manhã?")).toBeNull();
  });

  test("trava só a transferência de agendamento pedida pela IA", () => {
    expect(motivoEhEncaminhamentoDeAgendamento("AGENDAMENTO_TRANSICAO: deseja marcar")).toBe(true);
    expect(motivoEhEncaminhamentoDeAgendamento("Paciente deseja agendar cardiologia")).toBe(true);
    expect(motivoEhEncaminhamentoDeAgendamento("CANCELAMENTO_SOLICITADO: quer cancelar")).toBe(
      false,
    );
    expect(motivoEhEncaminhamentoDeAgendamento("Paciente pediu para remarcar")).toBe(false);
    expect(motivoEhEncaminhamentoDeAgendamento("Paciente pediu atendente")).toBe(false);
  });
});

describe("instruções enviadas à IA", () => {
  test("informar primeiro; o sistema pergunta e encaminha", () => {
    for (const regra of [REGRA_TRANSICAO_AGENDAMENTO, REGRA_AGENDAMENTO_POR_ITEM]) {
      expect(regra).toContain("Nao chame solicitar_atendente_humano por motivo de agendamento");
      expect(regra).toContain("setor Agendamento");
      expect(regra).toContain("AGENDAMENTO_TRANSICAO");
      expect(regra).toContain("chegada_sem_pre_agendamento");
      expect(regra).toContain("horarios habituais");
    }
    expect(REGRA_TRANSICAO_AGENDAMENTO).toContain("Horario habitual nao e vaga disponivel");
    expect(REGRA_AGENDAMENTO_POR_ITEM).toContain("nina_pode_agendar = true");
  });
});

describe("correções da auditoria de 12/10/2026", () => {
  test("agenda da clínica desligada: item marcado informa e encaminha", () => {
    expect(
      fluxoDoItem({ modalidade: "hora_marcada", ninaPodeAgendar: true, clinicaPodeAgendar: false }),
    ).toBe("informar_e_encaminhar");
    expect(
      fluxoDoRegistro(
        {
          estrutura: {
            nina_pode_agendar: true,
            complementos: [{ chave: "a", modalidade: "hora_marcada" }],
          },
        },
        false,
      ),
    ).toBe("informar_e_encaminhar");
  });

  test("tira a pergunta da IA sobre horário ou profissional e preserva o resto", () => {
    const texto = [
      "Temos Cardiologia com Dra. Teste e Dr. Exemplo.",
      "Dinheiro: R$ 100,00\nPix/cartão: R$ 120,00",
      "Você prefere o primeiro horário disponível ou deseja escolher um desses profissionais?",
    ].join("\n\n");
    expect(removerPerguntaDeAgendamento(texto)).toBe(
      "Temos Cardiologia com Dra. Teste e Dr. Exemplo.\n\nDinheiro: R$ 100,00\nPix/cartão: R$ 120,00",
    );
    expect(
      removerPerguntaDeAgendamento(
        "Atende segunda e quarta. Quer que eu verifique a disponibilidade?",
      ),
    ).toBe("Atende segunda e quarta.");
  });

  test("não mexe em perguntas sem relação nem esvazia a resposta", () => {
    const outra = "Atende segunda e quarta.\n\nPrecisa de mais alguma informação?";
    expect(removerPerguntaDeAgendamento(outra)).toBe(outra);
    const so = "Você prefere o primeiro horário disponível?";
    expect(removerPerguntaDeAgendamento(so)).toBe(so);
  });

  test("trava não segura causas operacionais nem encaminhamentos obrigatórios", () => {
    for (const motivo of [
      "Vaga indisponível; paciente deseja agendar",
      "Lista com mais de 8 profissionais; deseja marcar",
      "CATALOGO_ATENDIMENTO_HUMANO / PROFISSIONAL_SFP: quer agendar",
      "Falha operacional ao agendar; paciente quer marcar",
    ])
      expect(motivoEhEncaminhamentoDeAgendamento(motivo)).toBe(false);
  });
});
