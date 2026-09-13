import { describe, expect, it } from "bun:test";
import { avaliarGrounding, ClaimGroundingValidator } from "./claims";
import { extrairEvidencia } from "./evidencia-extrator";
import {
  construirPlanoFactual,
  formatarPlanoFactualParaModelo,
  vincularTextoAoPlanoFactual,
} from "./plano-factual";
import type { ContextoConfianca } from "./types";
import { decidirConfianca } from "./engine";
import { executarValidadoresDeConfianca } from "./validators";

function contexto(): ContextoConfianca {
  const evidencia = extrairEvidencia({
    ferramenta: "consultar_base_conhecimento",
    capacidade: "searchKnowledgeBase",
    fonte: "base_conhecimento",
    success: true,
    args: { termo: "cardiologia" },
    dados: {
      records: [
        {
          id: "medico-carlos",
          medico: "Carlos Silva",
          procedimento: "Consulta Cardiologia",
          unidade: "Unidade Centro",
          extras: {
            horarios: [{ dia: "Quarta", inicio: "13:00" }],
            formas_pagamento: [
              { forma: "Dinheiro", valor: 120, condicao: "Consulta Cardiologia" },
              { forma: "Cartão", valor: 145, condicao: "Consulta Cardiologia" },
            ],
          },
        },
      ],
    },
  });
  return {
    requestedAction: null,
    intent: "informacao",
    mensagemPaciente: "Vou fazer com o Dr. Carlos",
    fatos: evidencia.fatos,
    consultas: [evidencia.consulta],
    retrievedSources: [{ tipo: "catalogo_publicado", temConteudo: true, publicado: true }],
    toolResults: [],
    businessContext: {
      ambiente: "homologacao",
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
  };
}

function textoDoPlano(ctx = contexto()) {
  return construirPlanoFactual(ctx)
    .itens.map((item) => item.claim.texto)
    .join("\n");
}

describe("plano factual nasce dos registros oficiais do servidor", () => {
  it("mantém médico, procedimento, unidade e preço associados à própria referência", () => {
    const plano = construirPlanoFactual(contexto());
    expect(plano.itens.length).toBeGreaterThan(3);
    const valor = plano.itens.find((item) => item.claim.tipo === "valor")!;
    expect(valor.registro).toBe("medico-carlos");
    expect(valor.referencia).toContain("#medico-carlos");
    expect(valor.claim.chave?.medicoNome).toBe("Carlos Silva");
    expect(valor.claim.texto).toContain("Carlos Silva");
    expect(valor.claim.texto).toContain("Unidade Centro");
    expect(valor.claim.texto).toContain("Consulta Cardiologia");
    expect(valor.claim.texto).toContain("Dinheiro");
    expect(plano.itens.some((item) => item.claim.tipo === "escala")).toBe(true);
  });

  it.each([
    [
      "sem fatos",
      (ctx: ContextoConfianca) => {
        ctx.fatos = [];
      },
    ],
    [
      "sem fonte",
      (ctx: ContextoConfianca) => {
        ctx.retrievedSources = [];
      },
    ],
    [
      "rascunho",
      (ctx: ContextoConfianca) => {
        ctx.retrievedSources[0]!.publicado = false;
      },
    ],
    [
      "publicação desconhecida",
      (ctx: ContextoConfianca) => {
        ctx.retrievedSources[0]!.publicado = undefined;
      },
    ],
    [
      "nota interna",
      (ctx: ContextoConfianca) => {
        ctx.retrievedSources[0]!.interna = true;
      },
    ],
    [
      "inativa",
      (ctx: ContextoConfianca) => {
        ctx.retrievedSources[0]!.ativo = false;
      },
    ],
    [
      "substituída",
      (ctx: ContextoConfianca) => {
        ctx.retrievedSources[0]!.substituidoPor = "nova";
      },
    ],
    [
      "sem consulta",
      (ctx: ContextoConfianca) => {
        ctx.consultas = [];
      },
    ],
    [
      "consulta falhou",
      (ctx: ContextoConfianca) => {
        ctx.consultas![0]!.status = "falha";
      },
    ],
    [
      "consulta cortada",
      (ctx: ContextoConfianca) => {
        ctx.consultas![0]!.truncado = true;
      },
    ],
    [
      "sem registro",
      (ctx: ContextoConfianca) => {
        ctx.fatos!.forEach((f) => {
          f.registro = null;
        });
      },
    ],
  ] as const)("não produz prova direta %s", (_nome, alterar) => {
    const ctx = contexto();
    alterar(ctx);
    expect(construirPlanoFactual(ctx).itens).toHaveLength(0);
  });

  it("rejeita fonte vencida e dado de outra clínica", () => {
    const ctx = contexto();
    ctx.retrievedSources[0]!.expiraEm = "2026-09-12T00:00:00Z";
    expect(construirPlanoFactual(ctx, { agora: "2026-09-13T00:00:00Z" }).itens).toHaveLength(0);
    delete ctx.retrievedSources[0]!.expiraEm;
    ctx.businessContext.clinicaId = "clinica-atual";
    ctx.fatos!.forEach((f) => {
      f.clinicaId = "outra-clinica";
    });
    expect(construirPlanoFactual(ctx).itens).toHaveLength(0);
  });

  it("uma fonte de outro registro não publica o registro usado na resposta", () => {
    const ctx = contexto();
    ctx.retrievedSources = [
      {
        tipo: "catalogo_publicado",
        referencia: "outro-registro",
        temConteudo: true,
        publicado: true,
      },
    ];
    expect(construirPlanoFactual(ctx).itens).toHaveLength(0);
    ctx.retrievedSources.push({
      tipo: "catalogo_publicado",
      referencia: "medico-carlos",
      temConteudo: true,
      publicado: false,
    });
    expect(construirPlanoFactual(ctx).itens).toHaveLength(0);
    ctx.retrievedSources[1]!.publicado = true;
    expect(construirPlanoFactual(ctx).itens.length).toBeGreaterThan(0);
  });

  it("identidade da consulta conserva escopo e não confunde outra consulta que falhou", () => {
    const ctx = contexto();
    const consulta = ctx.consultas![0]!;
    ctx.fatos!.forEach((fato) => {
      fato.consulta = consulta.id;
    });
    ctx.consultas!.push({
      ...consulta,
      id: "consultar_base_conhecimento|outro-escopo",
      status: "falha",
    });
    expect(construirPlanoFactual(ctx).itens.length).toBeGreaterThan(0);
    // Sem identidade suficiente não se escolhe o resultado conveniente.
    ctx.fatos!.forEach((fato) => {
      fato.consulta = consulta.consulta;
    });
    expect(construirPlanoFactual(ctx).itens).toHaveLength(0);
  });

  it("texto do assistant e claims declarados pelo modelo não produzem fatos", () => {
    const ctx = contexto();
    ctx.fatos = [];
    ctx.claims = [
      {
        tipo: "valor",
        texto: "Consulta Cardiologia custa R$ 999,00",
        valor: "R$ 999,00",
        fonte: { tipo: "catalogo_publicado" },
      },
    ];
    ctx.evidenciasFluxo = {
      registroFerramentasCompleto: true,
      historicoCompleto: true,
      sessionId: "teste",
      historico: [{ role: "assistant", content: ctx.claims[0]!.texto }],
    };
    expect(construirPlanoFactual(ctx).itens).toHaveLength(0);
    expect(avaliarGrounding(ctx, ctx.claims[0]!.texto).suportados).toBe(0);
  });

  it("o filtro de médico exige identidade exata e não escolhe nome parecido", () => {
    const ctx = contexto();
    expect(construirPlanoFactual(ctx, { medicoId: "medico-carlos" }).itens.length).toBeGreaterThan(
      0,
    );
    expect(construirPlanoFactual(ctx, { medicoId: "carlos" }).itens).toHaveLength(0);
    expect(construirPlanoFactual(ctx, { medicoId: "outro-medico" }).itens).toHaveLength(0);
  });

  it("não escolhe um preço quando duas referências equivalentes discordam", () => {
    const ctx = contexto();
    const preco = ctx.fatos!.find((f) => f.campo === "preco")!;
    ctx.fatos!.push({ ...preco, registro: "catalogo-divergente", valor: "R$ 999,00" });
    const plano = construirPlanoFactual(ctx);
    expect(
      plano.itens.some(
        (item) =>
          item.claim.tipo === "valor" && item.claim.chave?.condicoes === preco.chave?.condicoes,
      ),
    ).toBe(false);
  });

  it("limita volume sem declarar que o restante não existe", () => {
    const plano = construirPlanoFactual(contexto(), { maxItens: 1 });
    expect(plano.itens).toHaveLength(1);
    expect(plano.truncado).toBe(true);
    const dados = JSON.parse(formatarPlanoFactualParaModelo(plano));
    expect(dados.cobertura).toContain("não comprova ausência");
    expect(construirPlanoFactual(contexto(), { maxCaracteres: 5 }).itens).toHaveLength(0);
  });

  it("não oferece vaga, reserva, idade mínima ou restrição livre como linha comprovada", () => {
    const ctx = contexto();
    const base = ctx.fatos![0]!;
    ctx.fatos!.push(
      { ...base, entidade: "vaga", campo: "slot", valor: "amanhã às 13:00", fonte: "agenda" },
      {
        ...base,
        entidade: "agendamento",
        campo: "appointment_id",
        valor: "reserva-1",
        fonte: "agenda",
      },
      { ...base, entidade: "restricao", campo: "observacao", valor: "6 anos" },
    );
    const texto = textoDoPlano(ctx);
    expect(texto).not.toContain("amanhã");
    expect(texto).not.toContain("reserva-1");
    expect(texto).not.toContain("6 anos");
    expect(texto).not.toContain("PIX");
  });
});

describe("a linha integral comprovada não aprova o resto da resposta", () => {
  it("confere cada linha literal uma única vez com sua referência", () => {
    const ctx = contexto();
    const plano = construirPlanoFactual(ctx);
    const texto = plano.itens.map((item) => `- **${item.claim.texto}**`).join("\n");
    const resultado = avaliarGrounding(ctx, texto);
    expect(resultado.claims).toHaveLength(plano.itens.length);
    expect(resultado.suportados).toBe(plano.itens.length);
    expect(
      resultado.claims.every(
        (c) => c.origem === "estruturado" && c.referencia?.includes("#medico-carlos"),
      ),
    ).toBe(true);
  });

  it.each([
    ["preço", (t: string) => t.replace("R$ 120,00", "R$ 999,00")],
    ["profissional", (t: string) => t.replaceAll("Carlos Silva", "João Inventado")],
    ["unidade", (t: string) => t.replaceAll("Unidade Centro", "Unidade Norte")],
    ["pagamento", (t: string) => t.replaceAll("Dinheiro", "PIX")],
    [
      "qualificador",
      (t: string) => t.replaceAll("Consulta Cardiologia", "Consulta Cardiologia Infantil"),
    ],
  ] as const)("não cobre alteração de %s com a mesma referência", (_nome, alterar) => {
    const ctx = contexto();
    const item = construirPlanoFactual(ctx).itens.find((i) => i.claim.tipo === "valor")!;
    const texto = alterar(item.claim.texto);
    expect(texto).not.toBe(item.claim.texto);
    const vinculo = vincularTextoAoPlanoFactual(texto, construirPlanoFactual(ctx));
    expect(vinculo.confirmados).toHaveLength(0);
    expect(vinculo.textoRestante).toBe(texto);
    const resultado = avaliarGrounding(ctx, texto);
    expect(
      resultado.semEvidencia.length + resultado.naoVerificados.length + resultado.limitacoes.length,
    ).toBeGreaterThan(0);
  });

  it("não aceita frase com negação ou detalhe extra ao redor do texto exato", () => {
    const plano = construirPlanoFactual(contexto());
    const linha = plano.itens[0]!.claim.texto;
    for (const texto of [
      `Não. ${linha}`,
      `${linha} É gratuito.`,
      `${linha} Para qualquer médico.`,
    ]) {
      expect(vincularTextoAoPlanoFactual(texto, plano).confirmados).toHaveLength(0);
    }
  });

  it("horário habitual não comprova vaga declarada na mesma resposta", () => {
    const ctx = contexto();
    const texto = textoDoPlano(ctx) + "\n\nTemos vaga amanhã às 13:00 com o Dr. Carlos Silva.";
    const resultado = avaliarGrounding(ctx, texto);
    expect(resultado.semEvidencia.some((c) => c.tipo === "disponibilidade")).toBe(true);
    expect(ClaimGroundingValidator({ ...ctx, draftText: texto }).status).not.toBe("PASS");
  });

  it("uma informação inventada acrescentada é avaliada separadamente", () => {
    const ctx = contexto();
    const texto =
      textoDoPlano(ctx) + "\n\nA consulta de Neurologia com o Dr. João Inventado custa R$ 999,00.";
    expect(avaliarGrounding(ctx, texto).semEvidencia.length).toBeGreaterThan(0);
  });

  it("texto operacional não interpretado permanece UNKNOWN ao lado de fatos corretos", () => {
    const ctx = contexto();
    const texto = textoDoPlano(ctx) + "\n\nDuração: 07:45.";
    const resultado = avaliarGrounding(ctx, texto);
    expect(resultado.limitacoes).toContain(
      "trecho operacional adicional não reconhecido — o plano factual não comprova o restante da resposta",
    );
    expect(ClaimGroundingValidator({ ...ctx, draftText: texto }).status).toBe("UNKNOWN");
  });

  it.each([
    "Duração: 07:45. Quer agendar?",
    "Duração: 07:45.\nGostaria de verificar as vagas disponíveis?",
    "O atendimento dura 40 minutos.",
    "O atendimento dura 2 horas. Gostaria de agendar?",
    "O exame garante 100% de cura.",
    "O resultado do exame é garantido. Gostaria de agendar?",
  ])(
    "não encobre declaração adicional com fatos corretos ou pergunta posterior: %s",
    (adicional) => {
      const ctx = contexto();
      const texto = textoDoPlano(ctx) + "\n\n" + adicional;
      const r = ClaimGroundingValidator({ ...ctx, draftText: texto });
      expect(r.status).toBe("UNKNOWN");
      expect(decidirConfianca({ ...ctx, draftText: texto }).decision).not.toBe("ALLOW");
    },
  );

  it("uma pergunta sobre horário após o plano não é afirmação adicional", () => {
    const ctx = contexto();
    const texto = textoDoPlano(ctx) + "\n\nGostaria de verificar a disponibilidade de horários?";
    expect(ClaimGroundingValidator({ ...ctx, draftText: texto }).status).toBe("PASS");
  });

  it("o limite de apresentação não reduz o universo de fatos contra o qual verificar", () => {
    const ctx = contexto();
    const original = ctx.fatos!.find((f) => f.campo === "preco")!;
    ctx.fatos = Array.from({ length: 35 }, (_, i) => ({
      ...original,
      registro: `registro-${i}`,
      chave: { procedimento: `Exame publicado ${i}`, condicoes: "Dinheiro" },
    }));
    const planoModelo = construirPlanoFactual(ctx, { maxItens: 40, maxCaracteres: 12000 });
    expect(planoModelo.itens).toHaveLength(35);
    expect(construirPlanoFactual(ctx).itens.length).toBeLessThan(35);
    const texto = planoModelo.itens[34]!.claim.texto;
    const r = avaliarGrounding(ctx, texto);
    expect(r.suportados).toBe(1);
    expect(r.limitacoes).toHaveLength(0);
    expect(ClaimGroundingValidator({ ...ctx, draftText: texto }).status).toBe("PASS");
  });

  it("o mesmo instante verifica geração, grounding e vigência de uma fonte datada", () => {
    const ctx = contexto();
    const agora = new Date("2026-09-13T12:00:00Z");
    ctx.retrievedSources[0]!.expiraEm = "2026-09-14T12:00:00Z";
    ctx.fatos!.forEach((fato) => {
      fato.vigenteAte = "2026-09-14T12:00:00Z";
    });
    const plano = construirPlanoFactual(ctx, { agora: agora.toISOString() });
    expect(plano.itens.length).toBeGreaterThan(0);
    ctx.draftText = plano.itens[0]!.claim.texto;
    const resultado = decidirConfianca(ctx, { agora });
    expect(
      resultado.validators?.find((v) => v.validator === "ClaimGroundingValidator")?.status,
    ).toBe("PASS");
    expect(
      resultado.validators?.find((v) => v.validator === "SourceFreshnessValidator")?.status,
    ).toBe("PASS");
    expect(
      executarValidadoresDeConfianca({ ctx, agora }).find(
        (v) => v.validator === "ClaimGroundingValidator",
      )?.status,
    ).toBe("PASS");
    const depois = decidirConfianca(ctx, { agora: new Date("2026-09-15T12:00:00Z") });
    expect(
      depois.validators?.find((v) => v.validator === "ClaimGroundingValidator")?.status,
    ).not.toBe("PASS");
    expect(depois.validators?.find((v) => v.validator === "SourceFreshnessValidator")?.status).toBe(
      "BLOCK",
    );
    expect(depois.decision).not.toBe("ALLOW");
  });
});
