import { describe, expect, test } from "bun:test";
import { formatarTextoMobile } from "../resposta/formato-mobile";
import { ofertaNeutraDeAgendamento } from "../fluxo-agendamento-item";
import { fimDoHorario, semFimDoDia } from "../catalogo-constantes";
import { resumoHorarios } from "../catalogo";
import { removerModalidadeNaoPerguntada } from "../modalidade-nao-informada";
import {
  montarMensagemHandoffFallback,
  nomeDePessoa,
  validarMensagemHandoff,
} from "../../atendimento/mensagem-handoff";

// Fase 5 da homologação de 14/10/2026: textos e formatação. Dados fictícios.

describe("quebra de linha no meio da frase", () => {
  test("'Profissionais e horários habituais' fica na mesma linha", () => {
    const texto = formatarTextoMobile(
      "*Profissionais e horários habituais:*\n- *Dra. Teste:* segunda, das 08h às 15h",
    );
    expect(texto).toContain("*Profissionais e horários habituais:*");
    expect(formatarTextoMobile("*Profissional e horários habituais:*")).toBe(
      "*Profissional e horários habituais:*",
    );
  });

  test("marcador de lista não fica sozinho antes de 'Dinheiro:'", () => {
    const texto = formatarTextoMobile("*Valores:*\n* Dinheiro: R$ 250,00\n* Pix/cartão: R$ 300,00");
    expect(texto).toBe("*Valores:*\n* Dinheiro: R$ 250,00\n* Pix/cartão: R$ 300,00");
    expect(texto).not.toMatch(/^\*$/m);
  });

  test("valores na mesma linha continuam separados", () => {
    expect(formatarTextoMobile("Valores: Dinheiro: R$ 10,00 Pix/cartão: R$ 12,00")).toBe(
      "Valores:\nDinheiro: R$ 10,00\nPix/cartão: R$ 12,00",
    );
  });
});

describe("23:59 é horário sem fim definido", () => {
  test("fim 23:59 vira 'a partir de'", () => {
    expect(fimDoHorario("23:59")).toBeNull();
    expect(fimDoHorario("23:59:00")).toBeNull();
    expect(fimDoHorario("17:00")).toBe("17:00");
    expect(resumoHorarios([{ dia: "Quarta-feira", inicio: "07:00", fim: "23:59" }])).toBe(
      "Quarta-feira a partir de 07:00",
    );
    expect(resumoHorarios([{ dia: "Quarta-feira", inicio: "07:00", fim: "12:00" }])).toBe(
      "Quarta-feira 07:00–12:00",
    );
  });

  test("texto livre do cadastro", () => {
    expect(semFimDoDia("Quarta-feira 07:00–23:59")).toBe("Quarta-feira a partir de 07:00");
    expect(semFimDoDia("Sábado das 08h às 23h59")).toBe("Sábado a partir de 08h");
    expect(semFimDoDia("Segunda 08:00–12:00")).toBe("Segunda 08:00–12:00");
  });
});

describe("modalidade: pagamento e orientação obrigatória ficam", () => {
  test("'modalidade débito/crédito' é pagamento", () => {
    const texto = "O valor de R$ 145,00 vale tanto na modalidade débito quanto crédito.";
    expect(removerModalidadeNaoPerguntada(texto)).toBe(texto);
  });

  test("orientação sem agendamento fica inteira", () => {
    const texto =
      "Não é necessário agendar: o atendimento segue por ordem de chegada, basta comparecer.";
    expect(removerModalidadeNaoPerguntada(texto)).toBe(texto);
  });

  test("modalidade não perguntada ainda sai", () => {
    expect(
      removerModalidadeNaoPerguntada(
        "Dra. Teste atende às quartas.\n*Modalidade:* hora marcada\nValor: R$ 100,00.",
      ),
    ).toBe("Dra. Teste atende às quartas.\nValor: R$ 100,00.");
  });
});

describe("mensagem de encaminhamento", () => {
  test("nome de contato de teste não é nome de pessoa", () => {
    expect(nomeDePessoa("Lead Teste 01")).toBeNull();
    expect(nomeDePessoa("Contato WhatsApp")).toBeNull();
    expect(nomeDePessoa("Ana Souza")).toBe("Ana Souza");
    const texto = montarMensagemHandoffFallback({
      protocolo: "MJ-00001",
      nome: "Lead Teste 01",
      setor: null,
      motivo: "agendamento",
    });
    expect(texto).not.toMatch(/lead|teste/i);
  });

  test("terceira pessoa e nome de teste reprovam", () => {
    const base = { protocolo: "MJ-00001", assistente: "Maria" };
    expect(
      validarMensagemHandoff(
        "Certo, Lead Teste 01, vou encaminhar para nossa equipe, que continua por aqui. Protocolo MJ-00001.",
        base,
      ).problemas,
    ).toContain("usa nome de contato de teste");
    expect(
      validarMensagemHandoff(
        "Maria vai encaminhar para nossa equipe, que continua por aqui. Protocolo MJ-00001.",
        base,
      ).problemas,
    ).toContain("fala de si em terceira pessoa");
    expect(
      validarMensagemHandoff(
        "Vou encaminhar para nossa equipe, que continua por aqui. Protocolo MJ-00001.",
        base,
      ).ok,
    ).toBe(true);
  });
});

describe("item que a Nina não agenda (ciclo 1055)", () => {
  test("a Nina não se oferece para agendar", () => {
    expect(ofertaNeutraDeAgendamento("Valor: R$ 100,00.\n\nPosso te ajudar a agendar?")).toBe(
      "Valor: R$ 100,00.\n\nVocê gostaria de agendar?",
    );
    expect(
      ofertaNeutraDeAgendamento("Atende às sextas. Quer que eu agende para você na sexta?"),
    ).toBe("Atende às sextas. Você gostaria de agendar na sexta?");
    expect(ofertaNeutraDeAgendamento("Posso verificar a agenda para você?")).toBe(
      "Você gostaria de agendar?",
    );
  });
  test("pergunta neutra e outras frases ficam", () => {
    const texto = "Você gostaria de agendar? Posso tirar outra dúvida.";
    expect(ofertaNeutraDeAgendamento(texto)).toBe(texto);
  });
});
