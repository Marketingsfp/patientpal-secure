import { describe, expect, it } from "bun:test";
import { avaliarGrounding } from "./claims";
import { extrairEvidencia, type RetornoFerramenta } from "./evidencia-extrator";
import type { ContextoConfianca } from "./types";

const registro = {
  id: "consulta-teste",
  procedimento: "Consulta Cardiologia",
  medico: "Laura Silva",
  formas_pagamento: [
    { forma: "Dinheiro", valor: 120 },
    { forma: "Cartão", valor: 145 },
  ],
};

function contexto(
  registros: Record<string, unknown>[] = [registro],
  extra: Partial<RetornoFerramenta> = {},
): ContextoConfianca {
  const e = extrairEvidencia({
    ferramenta: "consultar_base_conhecimento",
    capacidade: "searchKnowledgeBase",
    fonte: "base_conhecimento",
    success: true,
    args: { termo: "cardiologia" },
    dados: { records: registros, found: true, knowledge_status: "found" },
    ...extra,
  });
  return {
    requestedAction: "informar_valor",
    mensagemPaciente: "Aceita PIX para consulta de Cardiologia?",
    fatos: e.fatos,
    consultas: [e.consulta],
    retrievedSources: [
      { tipo: "catalogo_publicado", referencia: "cat", temConteudo: true, publicado: true },
    ],
    toolResults: [
      {
        nome: "consultar_base_conhecimento",
        capacidade: "searchKnowledgeBase",
        fonte: "catalogo_publicado",
        success: true,
        temConteudo: true,
        erro: null,
      },
    ],
    businessContext: {
      ambiente: "homologacao",
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
  };
}

describe("cada forma associada ao preço precisa da própria evidência", () => {
  it.each(["dinheiro/PIX", "dinheiro ou PIX", "dinheiro e PIX", "dinheiro | PIX"])(
    "não perde PIX em %s",
    (formas) => {
      const r = avaliarGrounding(
        contexto(),
        `A consulta de Cardiologia custa R$ 120,00 no ${formas}.`,
      );
      const valores = r.claims.filter((c) => c.tipo === "valor");
      expect(valores).toHaveLength(2);
      expect(valores.find((c) => c.diagnostico?.forma === "pix")?.suportado).toBe(false);
      expect(valores.find((c) => c.diagnostico?.forma === "dinheiro")?.suportado).toBe(true);
    },
  );

  it("permite ambas quando o mesmo preço está cadastrado para ambas", () => {
    const ctx = contexto([
      {
        ...registro,
        formas_pagamento: [...registro.formas_pagamento, { forma: "PIX", valor: 120 }],
      },
    ]);
    const r = avaliarGrounding(ctx, "A consulta de Cardiologia custa R$ 120,00 no dinheiro/PIX.");
    expect(r.claims.filter((c) => c.tipo === "valor").every((c) => c.suportado)).toBe(true);
  });

  it("uma forma combinada explicitamente na fonte comprova as duas", () => {
    const ctx = contexto([
      { ...registro, formas_pagamento: [{ forma: "Dinheiro/PIX", valor: 120 }] },
    ]);
    const r = avaliarGrounding(ctx, "A consulta de Cardiologia custa R$ 120,00 no dinheiro/PIX.");
    expect(r.claims.filter((c) => c.tipo === "valor").every((c) => c.suportado)).toBe(true);
  });

  it("preço repetido não apaga a segunda condição", () => {
    const r = avaliarGrounding(
      contexto(),
      "A consulta de Cardiologia custa R$ 120,00 no dinheiro e R$ 120,00 no PIX.",
    );
    const valores = r.claims.filter((c) => c.tipo === "valor");
    expect(valores).toHaveLength(2);
    expect(valores.map((c) => c.suportado)).toEqual([true, false]);
  });

  it("preserva o cartão depois do grupo dinheiro/PIX", () => {
    const r = avaliarGrounding(
      contexto(),
      "A consulta de Cardiologia custa R$ 120,00 no dinheiro/PIX ou R$ 145,00 no cartão.",
    );
    const valores = r.claims.filter((c) => c.tipo === "valor");
    expect(valores).toHaveLength(3);
    expect(valores.find((c) => c.diagnostico?.forma === "cartao")?.suportado).toBe(true);
    expect(valores.find((c) => c.diagnostico?.forma === "pix")?.suportado).toBe(false);
  });

  it("não valida um preço de PIX diferente usando o dinheiro que coincide", () => {
    const ctx = contexto([
      {
        ...registro,
        formas_pagamento: [...registro.formas_pagamento, { forma: "PIX", valor: 130 }],
      },
    ]);
    const r = avaliarGrounding(ctx, "A consulta de Cardiologia custa R$ 120,00 no dinheiro/PIX.");
    expect(r.claims.find((c) => c.diagnostico?.forma === "pix")?.situacao).toBe("divergente");
  });

  it("serviços diferentes com o mesmo valor não se apagam", () => {
    const r = avaliarGrounding(
      contexto(),
      "A consulta de Cardiologia custa R$ 120,00 no dinheiro. A consulta de Pediatria custa R$ 120,00 no dinheiro.",
    );
    const valores = r.claims.filter((c) => c.tipo === "valor");
    expect(valores).toHaveLength(2);
    expect(valores.map((c) => c.suportado)).toEqual([true, false]);
  });

  it("preço da consulta geral não comprova o preço da consulta infantil", () => {
    const ctx = contexto([
      {
        ...registro,
        procedimento: "Consulta Cardiologia, Cardiologia Infantil",
        formas_pagamento: [
          { forma: "Dinheiro", valor: 120, condicao: "Consulta Cardiologia" },
          { forma: "Dinheiro", valor: 160, condicao: "Consulta Cardiologia Infantil" },
        ],
      },
    ]);
    const errado = avaliarGrounding(
      ctx,
      "A consulta de Cardiologia Infantil custa R$ 120,00 no dinheiro.",
    );
    expect(errado.claims.find((c) => c.tipo === "valor")?.suportado).toBe(false);
    const correto = avaliarGrounding(
      ctx,
      "A consulta de Cardiologia Infantil custa R$ 160,00 no dinheiro.",
    );
    expect(correto.claims.find((c) => c.tipo === "valor")?.suportado).toBe(true);
  });
});

describe("aceitação e negativa verificadas na lista completa do caso", () => {
  it.each([
    "Não aceitamos PIX para a consulta de Cardiologia.",
    "Para a consulta de Cardiologia, PIX não é aceito.",
  ])("confirma a forma ausente: %s", (texto) => {
    const r = avaliarGrounding(contexto(), texto);
    expect(r.claims).toHaveLength(1);
    expect(r.claims[0]?.suportado).toBe(true);
  });

  it("confere cada forma sem preço e preserva negativa ao lado de aceite", () => {
    const r = avaliarGrounding(
      contexto(),
      "Para a consulta de Cardiologia, não aceitamos PIX, mas aceitamos dinheiro e cartão.",
    );
    expect(r.claims.filter((c) => c.tipo === "restricao")).toHaveLength(3);
    expect(r.claims.every((c) => c.suportado)).toBe(true);
  });

  it("aceitar PIX sem constar na lista contradiz a política do caso", () => {
    const r = avaliarGrounding(contexto(), "Aceitamos PIX para a consulta de Cardiologia.");
    expect(r.claims.find((c) => c.tipo === "restricao")?.situacao).toBe("divergente");
  });

  it("não permite negar dinheiro que foi declarado", () => {
    const r = avaliarGrounding(
      contexto(),
      "Não aceitamos dinheiro para a consulta de Cardiologia.",
    );
    expect(r.claims[0]?.situacao).toBe("divergente");
  });

  it("negação curta mantém o serviço da pergunta", () => {
    const r = avaliarGrounding(contexto(), "Não aceitamos PIX.");
    expect(r.claims[0]?.suportado).toBe(true);
    expect(r.claims[0]?.valorAfirmado).toBe("forma_pagamento:pix");
  });

  it("declarações consecutivas mantêm o assunto explícito na própria resposta", () => {
    const ctx = contexto();
    ctx.mensagemPaciente = "Aceita PIX?";
    const r = avaliarGrounding(
      ctx,
      "Na consulta de Cardiologia, não aceitamos PIX. Aceitamos dinheiro e cartão.",
    );
    expect(r.claims).toHaveLength(3);
    expect(r.claims.every((c) => c.suportado)).toBe(true);
  });

  it("a troca explícita de serviço substitui o assunto anterior", () => {
    const ctx = contexto();
    const r = avaliarGrounding(
      ctx,
      "Na consulta de Cardiologia, não aceitamos PIX. Aceitamos dinheiro para Pediatria.",
    );
    expect(r.claims.map((c) => c.suportado)).toEqual([true, false]);
  });

  it("perguntar a forma não é declaração de aceite", () => {
    const r = avaliarGrounding(contexto(), "Você pode pagar em PIX?");
    expect(r.claims).toHaveLength(0);
  });

  it.each(["falha", "parcial", "nao_verificado", "vazio"] as const)(
    "consulta %s não prova ausência",
    (status) => {
      const ctx = contexto();
      ctx.consultas![0]!.status = status;
      expect(avaliarGrounding(ctx, "Não aceitamos PIX.").claims[0]?.suportado).toBe(false);
    },
  );

  it("retorno truncado não prova ausência", () => {
    const ctx = contexto();
    ctx.consultas![0]!.truncado = true;
    expect(avaliarGrounding(ctx, "Não aceitamos PIX.").claims[0]?.suportado).toBe(false);
  });

  it("outra consulta da mesma ferramenta não cobre a falha da consulta do fato", () => {
    const ctx = contexto();
    ctx.consultas!.push({ ...ctx.consultas![0]!, id: "outra-consulta", status: "com_itens" });
    ctx.consultas![0]!.status = "falha";
    expect(avaliarGrounding(ctx, "Não aceitamos PIX.").claims[0]?.suportado).toBe(false);
  });

  it.each([undefined, null, [{ forma: "" }]].map((formas_pagamento) => ({ formas_pagamento })))(
    "campo de formas ausente ou inválido não é lista fechada: %j",
    ({ formas_pagamento }) => {
      const ctx = contexto([{ ...registro, formas_pagamento, preco_dinheiro: 120 }]);
      expect(avaliarGrounding(ctx, "Não aceitamos PIX.").claims[0]?.suportado).toBe(false);
    },
  );

  it("preço de outro serviço não comprova rejeição", () => {
    expect(
      avaliarGrounding(contexto(), "Não aceitamos PIX para a consulta de Pediatria.").claims[0]
        ?.suportado,
    ).toBe(false);
  });

  it("lista de um profissional não comprova rejeição por outro", () => {
    const r = avaliarGrounding(
      contexto(),
      "A Dra. Carla Santos não aceita PIX para a consulta de Cardiologia.",
    );
    expect(r.claims.find((c) => c.tipo === "restricao")?.suportado).toBe(false);
  });

  it("não usa as formas de outra clínica", () => {
    const ctx = contexto([registro], { clinicaId: "clinica-outra" });
    ctx.businessContext.clinicaId = "clinica-atual";
    expect(avaliarGrounding(ctx, "Não aceitamos PIX.").claims[0]?.suportado).toBe(false);
  });

  it("não mistura cardiologia infantil e geral", () => {
    const ctx = contexto([{ ...registro, procedimento: "Consulta Cardiologia Infantil" }]);
    expect(
      avaliarGrounding(ctx, "Não aceitamos PIX para a consulta de Cardiologia.").claims[0]
        ?.suportado,
    ).toBe(false);
  });

  it("não transforma lista de um serviço em política de toda a clínica", () => {
    const ctx = contexto();
    ctx.mensagemPaciente = "A clínica aceita PIX?";
    expect(avaliarGrounding(ctx, "Não aceitamos PIX.").claims[0]?.suportado).toBe(false);
  });

  it("listas conflitantes pedem esclarecimento", () => {
    const ctx = contexto([
      registro,
      {
        ...registro,
        id: "outro",
        medico: "Carla Santos",
        formas_pagamento: [{ forma: "PIX", valor: 120 }],
      },
    ]);
    expect(avaliarGrounding(ctx, "Não aceitamos PIX.").claims[0]?.situacao).toBe("nao_verificado");
  });

  it.each([undefined, null, [{ forma: "" }]].map((formas_pagamento) => ({ formas_pagamento })))(
    "outro profissional sem lista completa impede negativa geral: %j",
    ({ formas_pagamento }) => {
      const ctx = contexto([
        registro,
        { ...registro, id: "outro", medico: "Carla Santos", formas_pagamento },
      ]);
      expect(avaliarGrounding(ctx, "Não aceitamos PIX.").claims[0]?.suportado).toBe(false);
      const especifico = avaliarGrounding(
        ctx,
        "A Dra. Laura Silva não aceita PIX para a consulta de Cardiologia.",
      );
      expect(especifico.claims.find((c) => c.tipo === "restricao")?.suportado).toBe(true);
    },
  );

  it("lista vazia explícita permite negar e nunca inventa uma forma aceita", () => {
    const ctx = contexto([{ ...registro, formas_pagamento: [] }]);
    expect(avaliarGrounding(ctx, "Não aceitamos PIX.").claims[0]?.suportado).toBe(true);
    expect(avaliarGrounding(ctx, "Aceitamos dinheiro.").claims[0]?.suportado).toBe(false);
  });

  it("à vista não significa dinheiro nem PIX", () => {
    const ctx = contexto([{ ...registro, formas_pagamento: [{ forma: "À vista", valor: 120 }] }]);
    for (const forma of ["dinheiro", "PIX"]) {
      expect(avaliarGrounding(ctx, `Aceitamos ${forma}.`).claims[0]?.suportado).toBe(false);
      expect(
        avaliarGrounding(ctx, `A consulta de Cardiologia custa R$ 120,00 no ${forma}.`).claims.find(
          (c) => c.tipo === "valor",
        )?.suportado,
      ).toBe(false);
    }
    expect(
      avaliarGrounding(ctx, "A consulta de Cardiologia custa R$ 120,00 à vista.").claims.find(
        (c) => c.tipo === "valor",
      )?.suportado,
    ).toBe(true);
  });

  it("nega cheque ausente sem tratar dinheiro ou cartão como cheque", () => {
    const ctx = contexto();
    ctx.mensagemPaciente = "Aceita cheque para a consulta de Cardiologia?";
    const r = avaliarGrounding(ctx, "Não aceitamos cheque para a consulta de Cardiologia.");
    expect(r.claims[0]?.suportado).toBe(true);
    expect(r.claims[0]?.valorAfirmado).toBe("forma_pagamento:cheque");
  });
});
