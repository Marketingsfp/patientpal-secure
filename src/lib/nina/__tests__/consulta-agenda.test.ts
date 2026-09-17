import { describe, expect, it } from "bun:test";
import {
  autorizarConsultaAgenda,
  interesseEmConsultarAgenda,
  preferePrimeiroDisponivel,
  type ContextoConsultaAgenda,
} from "../consulta-agenda";

const alex = {
  id: "8cd0109d-7d28-46c4-895f-f120ea0cd111",
  nome: "Alex Francisco de Oliveira Louza",
};
const antonio = { id: "8cd0109d-7d28-46c4-895f-f120ea0cd222", nome: "Antonio Cobucci" };
const contexto = (
  mensagemAtual: string,
  oferta?: string,
  extra: Partial<ContextoConsultaAgenda> = {},
): ContextoConsultaAgenda => ({
  mensagemAtual,
  historico: oferta ? [{ role: "assistant", content: oferta }] : [],
  ...extra,
});
const ofertaAlex =
  "O Dr. Alex Louza atende às quartas às 13h. Gostaria que eu verificasse as vagas do Dr. Alex Louza?";
const ofertaGeral =
  "O Dr. Alex Louza atende às quartas às 13h e o Dr. Antonio Cobucci às quintas às 13:30. Qual médico prefere para verificar vagas?";

describe("escolha entre médico e primeiro disponível", () => {
  const oferta = "Você prefere escolher um desses profissionais ou quer que eu consulte quem tem a disponibilidade mais próxima?";
  it.each(["o primeiro disponível", "o mais próximo", "quem tiver antes", "qualquer um",
    "não tenho preferência", "quero quem puder me atender mais cedo", "primeiro disponível pra hoje"])("interpreta %s", mensagem => {
    expect(preferePrimeiroDisponivel(contexto(mensagem, oferta))).toBe(true);
    expect(interesseEmConsultarAgenda(contexto(mensagem, oferta))).toBe(true);
  });
  it.each(["sim", "com Alex Louza", "não quero o primeiro disponível", "qual o valor do mais próximo?",
    "agora não", "mais barato"])("não escolhe pela paciente: %s", mensagem => {
    expect(preferePrimeiroDisponivel(contexto(mensagem, oferta))).toBe(false);
  });
  it("não reutiliza oferta de outro assunto", () => {
    expect(preferePrimeiroDisponivel(contexto("qualquer um", "Qual pagamento prefere?"))).toBe(false);
    expect(preferePrimeiroDisponivel(contexto("primeiro disponível", oferta, { mudancaTema: true }))).toBe(false);
  });
  it("aceita pedido direto pela primeira vaga sem médico escolhido", () => {
    expect(preferePrimeiroDisponivel(contexto("Quero marcar consulta com o primeiro disponível"))).toBe(true);
  });
  it("preserva a busca entre médicos ao acrescentar hoje, sem herdar outra escolha", () => {
    const historico = [{ role: "assistant", content: oferta }, { role: "user", content: "o primeiro disponível" },
      { role: "assistant", content: "Você prefere algum dia? Assim verifico as vagas." }];
    expect(preferePrimeiroDisponivel({ mensagemAtual: "sim, pra hoje", historico })).toBe(true);
    expect(preferePrimeiroDisponivel({ mensagemAtual: "amanhã", historico: [...historico,
      { role: "user", content: "prefiro Alex Louza" }, { role: "assistant", content: "Qual dia prefere?" }] })).toBe(false);
  });
  it("não troca uma solicitação específica pelo primeiro médico da clínica", () => {
    expect(preferePrimeiroDisponivel(contexto("a primeira disponível com Dr. Alex", oferta))).toBe(false);
    expect(preferePrimeiroDisponivel(contexto("a primeira disponível com Alex Louza", oferta))).toBe(false);
    expect(preferePrimeiroDisponivel(contexto("a primeira disponível", "Posso ver a agenda dele?", { medicoEscolhido: alex }))).toBe(false);
  });
});

describe("oferta de agenda seguida da pergunta de escolha do profissional", () => {
  const joao = { id: "8cd0109d-7d28-46c4-895f-f120ea0cd333", nome: "João Hélio" };
  const composta = "Você gostaria de verificar as vagas disponíveis na agenda? Se sim, qual dos profissionais você prefere?";
  it.each(["com o joao helio", "prefiro João Hélio", "com Dr. João Hélio"])(
    "a escolha responde à oferta e permite consultar somente o médico indicado: %s", mensagem => {
      const ctx = contexto(mensagem, composta);
      expect(interesseEmConsultarAgenda(ctx)).toBe(true);
      expect(autorizarConsultaAgenda(ctx, joao, [joao, alex]).permitido).toBe(true);
      expect(autorizarConsultaAgenda(ctx, alex, [joao, alex]).permitido).toBe(false);
    });
  it("sim após a oferta específica permite consultar sem data e não cria reserva", () => {
    const ctx = contexto("sim", "Ótimo! O Dr. João Hélio atende às terças, quintas e sextas-feiras (por agendamento).\nGostaria que eu consulte vagas e horários disponíveis na agenda para a sua consulta com ele?", {
      medicoEscolhido: joao,
    });
    expect(autorizarConsultaAgenda(ctx, joao, [joao, alex]).permitido).toBe(true);
    expect(autorizarConsultaAgenda(ctx, alex, [joao, alex]).permitido).toBe(false);
  });
  it("sim à oferta geral não escolhe médico; assunto novo não herda a oferta", () => {
    expect(autorizarConsultaAgenda(contexto("sim", composta), joao).permitido).toBe(false);
    for (const final of ["Qual é seu nome?", "Qual forma de pagamento prefere?", "Informe seu nome. Qual profissional prefere?"]) {
      expect(interesseEmConsultarAgenda(contexto("João Hélio", `${composta} ${final}`))).toBe(false);
    }
    expect(interesseEmConsultarAgenda(contexto("não quero consultar vagas", composta))).toBe(false);
  });
});

describe("consulta de agenda depende do pedido e do médico definido", () => {
  it.each([
    "vcs tem cardiologista?",
    "Quais horários o Dr. Alex atende?",
    "Quais horários o Dr. Alex atende",
    "Quais dias o Dr. Alex atende?",
    "Sim, mas quanto custa?",
    "qual é o endereço?",
    "não quero consultar a agenda",
    "agora não",
    "não, só o valor",
    "não preciso",
    "só quero saber os horários de atendimento",
  ])("não inicia agenda com informação geral, recusa ou nova pergunta: %s", (mensagem) => {
    expect(interesseEmConsultarAgenda(contexto(mensagem, ofertaAlex))).toBe(false);
    expect(autorizarConsultaAgenda(contexto(mensagem, ofertaAlex), alex).permitido).toBe(false);
  });

  it.each(["sim", "Sim, pode verificar", "pode consultar", "sim, amanhã", "por favor"])(
    "aceite da oferta específica autoriza apenas o médico oferecido: %s",
    (mensagem) => {
      expect(autorizarConsultaAgenda(contexto(mensagem, ofertaAlex), alex).permitido).toBe(true);
      expect(autorizarConsultaAgenda(contexto(mensagem, ofertaAlex), antonio).permitido).toBe(
        false,
      );
    },
  );

  it("um nome na lista informativa não é seleção na pergunta final", () => {
    expect(autorizarConsultaAgenda(contexto("sim", ofertaGeral), alex).permitido).toBe(false);
    expect(autorizarConsultaAgenda(contexto("sim", ofertaGeral), antonio).permitido).toBe(false);
    expect(autorizarConsultaAgenda(contexto("Alex Louza", ofertaGeral), alex).permitido).toBe(true);
    expect(autorizarConsultaAgenda(contexto("Alex Louza", ofertaGeral), antonio).permitido).toBe(
      false,
    );
    expect(autorizarConsultaAgenda(contexto("com Dr. Alex", ofertaGeral), alex).permitido).toBe(
      true,
    );
  });

  it("não reaproveita oferta antiga quando a última pergunta é outra", () => {
    expect(
      autorizarConsultaAgenda(contexto("sim", `${ofertaAlex} Qual é seu nome?`), alex).permitido,
    ).toBe(false);
    expect(
      autorizarConsultaAgenda(contexto("sim", `${ofertaAlex} Consulte nossa recepção.`), alex)
        .permitido,
    ).toBe(false);
    expect(autorizarConsultaAgenda(contexto("sim", `${ofertaAlex} 😊`), alex).permitido).toBe(true);
  });

  it.each([
    "Tem vagas com Dr. Alex?",
    "Gostaria de consultar a agenda do Dr. Alex",
    "Quero agendar com Alex Louza",
    "Marcar com Dr. Alex",
    "Quais horários livres do Dr. Alex?",
  ])("pedido explícito aceita nome público abreviado: %s", (mensagem) => {
    expect(autorizarConsultaAgenda(contexto(mensagem), alex).permitido).toBe(true);
    expect(autorizarConsultaAgenda(contexto(mensagem), antonio).permitido).toBe(false);
  });

  it("completa o dia solicitado após pedido explícito sem mudar médico", () => {
    const historico = [
      { role: "user", content: "Quero verificar vagas com Dr. Alex" },
      { role: "assistant", content: "Qual dia prefere?" },
    ];
    expect(
      autorizarConsultaAgenda(contexto("amanhã", undefined, { historico }), alex).permitido,
    ).toBe(true);
    expect(
      autorizarConsultaAgenda(contexto("amanhã", undefined, { historico }), antonio).permitido,
    ).toBe(false);
    expect(
      autorizarConsultaAgenda(contexto("quanto custa?", undefined, { historico }), alex).permitido,
    ).toBe(false);
  });

  it("médico selecionado não cria interesse nem substitui uma nova escolha", () => {
    const escolhido = { medicoEscolhido: alex };
    expect(
      autorizarConsultaAgenda(contexto("tem vagas amanhã?", undefined, escolhido), alex).permitido,
    ).toBe(true);
    expect(
      autorizarConsultaAgenda(contexto("qual o valor?", ofertaAlex, escolhido), alex).permitido,
    ).toBe(false);
    expect(
      autorizarConsultaAgenda(
        contexto("tem vagas com Antonio Cobucci?", undefined, escolhido),
        alex,
      ).permitido,
    ).toBe(false);
    expect(
      autorizarConsultaAgenda(contexto("sim, com Antonio Cobucci", ofertaAlex, escolhido), alex)
        .permitido,
    ).toBe(false);
    expect(autorizarConsultaAgenda(contexto("amanhã", undefined, escolhido), alex).permitido).toBe(
      false,
    );
  });

  it("sim sozinho, médico ausente e identificador inventado não autorizam", () => {
    expect(autorizarConsultaAgenda(undefined, alex).permitido).toBe(false);
    expect(autorizarConsultaAgenda(contexto("sim"), alex).permitido).toBe(false);
    expect(autorizarConsultaAgenda(contexto("Quero verificar vagas"), null).permitido).toBe(false);
    expect(
      autorizarConsultaAgenda(contexto("Quero verificar vagas com Dr. Alex"), {
        ...alex,
        id: "inventado",
      }).permitido,
    ).toBe(false);
  });

  it.each([
    "Pode sim, amanhã, se tiver algum horário na parte da manhã, por favor",
    "Sim, pode verificar na próxima quinta na parte da tarde, por favor",
    "Por favor, pode consultar se houver algum horário disponível amanhã de manhã?",
  ])("aceite com preferência longa mantém o médico oferecido: %s", (mensagem) => {
    expect(interesseEmConsultarAgenda(contexto(mensagem, ofertaAlex))).toBe(true);
    expect(
      autorizarConsultaAgenda(contexto(mensagem, ofertaAlex), alex, [alex, antonio]).permitido,
    ).toBe(true);
    expect(
      autorizarConsultaAgenda(contexto(mensagem, ofertaAlex), antonio, [alex, antonio]).permitido,
    ).toBe(false);
  });

  it.each([
    "Sim, pode verificar, mas antes me fale o valor da consulta",
    "Pode sim, mas não quero que consulte a agenda agora",
    "Sim, mas prefiro consultar com Antonio Cobucci amanhã de manhã",
    "Sim, pode verificar meu exame, quero saber o preparo",
    "Sim, pode verificar se tiver horário, mas só depois",
  ])(
    "complemento longo não autoriza o médico anterior se muda de assunto ou escolha: %s",
    (mensagem) => {
      expect(
        autorizarConsultaAgenda(contexto(mensagem, ofertaAlex, { medicoEscolhido: alex }), alex, [
          alex,
          antonio,
        ]).permitido,
      ).toBe(false);
    },
  );

  it("aceite de oferta com pronome exige um único médico já definido", () => {
    const oferta = "Gostaria que eu verificasse as vagas dele?";
    const ctx = contexto("sim", oferta, { medicoEscolhido: alex });
    expect(autorizarConsultaAgenda(ctx, alex, [alex, antonio]).permitido).toBe(true);
    expect(autorizarConsultaAgenda(ctx, antonio, [alex, antonio]).permitido).toBe(false);
    expect(autorizarConsultaAgenda(contexto("sim", oferta), alex, [alex, antonio]).permitido).toBe(
      false,
    );
    expect(
      autorizarConsultaAgenda(
        contexto("sim, com Antonio Cobucci", oferta, { medicoEscolhido: alex }),
        alex,
        [alex, antonio],
      ).permitido,
    ).toBe(false);
    expect(
      autorizarConsultaAgenda(
        contexto("sim", "Posso verificar as vagas dele ou do Dr. Antonio Cobucci?", {
          medicoEscolhido: alex,
        }),
        alex,
        [alex, antonio],
      ).permitido,
    ).toBe(false);
  });

  it("e amanhã só continua agenda consultada anteriormente para o mesmo médico", () => {
    const semConsulta = contexto("e amanhã?", undefined, { medicoEscolhido: alex });
    expect(interesseEmConsultarAgenda(semConsulta)).toBe(false);
    expect(autorizarConsultaAgenda(semConsulta, alex, [alex, antonio]).permitido).toBe(false);
    const comConsulta = { ...semConsulta, disponibilidadeJaConsultada: true };
    expect(autorizarConsultaAgenda(comConsulta, alex, [alex, antonio]).permitido).toBe(true);
    expect(autorizarConsultaAgenda(comConsulta, antonio, [alex, antonio]).permitido).toBe(false);
  });

  it("sobrenome explícito impede trocar por homônimo e primeiro nome exige unicidade", () => {
    const homonimo = { id: "33333333-3333-4333-8333-333333333333", nome: "Alex Silva" };
    const oficiais = [alex, homonimo, antonio];
    for (const ctx of [contexto("Tem vaga com Dr. Alex Louza?"), contexto("sim", ofertaAlex)]) {
      expect(autorizarConsultaAgenda(ctx, alex, oficiais).permitido).toBe(true);
      expect(autorizarConsultaAgenda(ctx, homonimo, oficiais).permitido).toBe(false);
    }
    expect(
      autorizarConsultaAgenda(contexto("Tem vaga com Dr. Alex?"), alex, oficiais).permitido,
    ).toBe(false);
    expect(
      autorizarConsultaAgenda(contexto("Tem vaga com Dr. Alex?"), homonimo, oficiais).permitido,
    ).toBe(false);
  });
});
