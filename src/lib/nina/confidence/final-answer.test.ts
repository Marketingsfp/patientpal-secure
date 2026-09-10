/**
 * FASE 5 — testes de Final Answer Verification e claim-level grounding.
 *
 * Nada aqui chama modelo: a verificação é determinística.
 */
import { describe, expect, it } from "bun:test";
import { avaliarGrounding, extrairClaimsDoTexto } from "./claims";
import {
  assegurarAvaliacaoDoTextoFinal,
  avaliacaoValeParaOTexto,
  verificarRespostaFinal,
  verificarSegurancaDaAcao,
} from "./final-answer";
import { hashDoTexto } from "./hash";
import { montarContextoDoTurno, type EstadoDoTurno } from "./runtime";
import { POLITICA_PADRAO } from "./policy";

function turno(over: Partial<EstadoDoTurno> = {}): EstadoDoTurno {
  return {
    intent: "informacao",
    acao: "informar_valor",
    ferramentas: [
      {
        nome: "consultar_base_conhecimento",
        capacidade: "searchKnowledgeBase",
        fonte: "catalogo_publicado",
        success: true,
      },
    ],
    catalogoEncontrou: true,
    // FASE 2 — fatos que o servidor extrai do retorno real do catálogo.
    fatos: [
      {
        consulta: "consultar_base_conhecimento",
        capacidade: "searchKnowledgeBase",
        entidade: "procedimento",
        campo: "preco",
        valor: "R$ 150,00",
        fonte: "catalogo_publicado",
        chave: { procedimento: "cardiologia" },
      },
      {
        consulta: "consultar_base_conhecimento",
        capacidade: "searchKnowledgeBase",
        entidade: "profissional",
        campo: "nome",
        valor: "Dr. João",
        fonte: "catalogo_publicado",
      },
      {
        consulta: "consultar_base_conhecimento",
        capacidade: "searchKnowledgeBase",
        entidade: "procedimento",
        campo: "preparo",
        valor: "Não é preciso jejum",
        fonte: "catalogo_publicado",
        chave: { procedimento: "cardiologia" },
      },
    ],
    ...over,
  } as EstadoDoTurno;
}

const ctxDe = (e: Partial<EstadoDoTurno> = {}) => montarContextoDoTurno(turno(e));

// ---------------------------------------------------------------- grounding

describe("FASE 5 — claim-level grounding", () => {
  it("cada afirmação sensível é rastreada individualmente", () => {
    const claims = extrairClaimsDoTexto(
      "Cardiologia custa R$ 150. Dr. João atende no local e há vaga sábado 14h.",
    );
    const tipos = claims.map((c) => c.tipo);
    expect(tipos).toContain("valor");
    expect(tipos).toContain("profissional");
    expect(tipos).toContain("disponibilidade");
  });

  it("catálogo respondido NÃO valida uma afirmação de agenda", () => {
    const r = avaliarGrounding(
      ctxDe(),
      "Cardiologia custa R$ 150 e há vaga sábado 14h.",
    );
    const valor = r.claims.find((c) => c.tipo === "valor");
    const agenda = r.claims.find((c) => c.tipo === "disponibilidade");
    expect(valor?.suportado).toBe(true);
    expect(valor?.fonte).toBe("catalogo_publicado");
    expect(agenda?.suportado).toBe(false);
    expect(r.semEvidencia.length).toBe(1);
  });

  it("com a Agenda consultada, a afirmação de vaga passa a ter fonte", () => {
    const r = avaliarGrounding(
      ctxDe({
        ferramentas: [
          {
            nome: "consultar_base_conhecimento",
            capacidade: "searchKnowledgeBase",
            fonte: "catalogo_publicado",
            success: true,
          },
          {
            nome: "consultar_agenda",
            capacidade: "checkAvailability",
            fonte: "agenda",
            success: true,
          },
        ],
        fatos: [
          {
            consulta: "consultar_base_conhecimento",
            capacidade: "searchKnowledgeBase",
            entidade: "procedimento",
            campo: "preco",
            valor: "R$ 150,00",
            fonte: "catalogo_publicado",
            chave: { procedimento: "cardiologia" },
          },
          {
            consulta: "consultar_agenda",
            capacidade: "checkAvailability",
            entidade: "vaga",
            campo: "slot",
            valor: "sábado 14h",
            fonte: "agenda",
          },
        ],
      }),
      "Cardiologia custa R$ 150 e há vaga sábado 14h.",
    );
    expect(r.semEvidencia.length).toBe(0);
    expect(r.suportados).toBe(r.total);
  });

  it("afirmar agendamento concluído exige prova persistida (appointment_id)", () => {
    const semProva = avaliarGrounding(ctxDe(), "Pronto, seu agendamento está confirmado.");
    const claim = semProva.claims.find((c) => c.tipo === "agendamento");
    expect(claim?.suportado).toBe(false);
    expect(claim?.motivo).toContain("appointment_id");
  });

  it("muitos fatos com fonte não são penalizados", () => {
    const completo =
      "A consulta custa R$ 150, com o Dr. João, na unidade Centro. Não é preciso jejum.";
    const r = verificarRespostaFinal({ ctx: ctxDe(), textoFinal: completo });
    const grounding = avaliarGrounding(ctxDe(), completo);
    expect(grounding.semEvidencia.length).toBe(0);
    expect(r.blockers).not.toContain("AFIRMACAO_SEM_EVIDENCIA");
    // A antiga penalidade por "muitas categorias" não existe mais.
    expect(Object.keys(POLITICA_PADRAO.penalidades ?? {})).not.toContain("foco_da_resposta");
  });
});

// ------------------------------------------------------- separação de conceitos

describe("FASE 5 — action_safety e answer_confidence são coisas diferentes", () => {
  it("transferir é seguro, mas isso não vira nota 100 da mensagem", () => {
    const estado = turno({ handoffSolicitado: true, catalogoEncontrou: false, ferramentas: [] });
    const acao = verificarSegurancaDaAcao(montarContextoDoTurno(estado));
    const mensagem = verificarRespostaFinal({
      ctx: montarContextoDoTurno(estado),
      textoFinal: "A consulta custa R$ 480 — vou transferir você para uma atendente.",
    });
    expect(acao.tipoAvaliacao).toBe("action_safety");
    expect(mensagem.tipoAvaliacao).toBe("answer_confidence");
    expect(mensagem.score).toBeLessThan(100);
    expect(mensagem.level).not.toBe("HIGH");
  });

  it("a nota da mensagem é sempre do texto final avaliado", () => {
    const r = verificarRespostaFinal({ ctx: ctxDe(), textoFinal: "A consulta custa R$ 150." });
    expect(r.textoAvaliadoHash).toBe(hashDoTexto("A consulta custa R$ 150."));
  });
});

// ------------------------------------------------------------- gate de saída

describe("FASE 5 — gate de saída", () => {
  it("texto alterado depois da avaliação invalida e recalcula o score", () => {
    const ctx = ctxDe();
    const primeira = verificarRespostaFinal({ ctx, textoFinal: "A consulta custa R$ 150." });
    const gate = assegurarAvaliacaoDoTextoFinal({
      ctx,
      textoFinal: "Olá! A consulta custa R$ 150.", // saudação obrigatória aplicada depois
      avaliacaoPrevia: primeira,
    });
    expect(gate.recalculado).toBe(true);
    expect(gate.motivo).toBe("texto_alterado_apos_avaliacao");
    expect(gate.resultado.textoAvaliadoHash).toBe(hashDoTexto("Olá! A consulta custa R$ 150."));
  });

  it("avaliação de segurança da ação nunca é aceita como nota da mensagem", () => {
    const ctx = ctxDe();
    const acao = verificarSegurancaDaAcao(ctx);
    expect(avaliacaoValeParaOTexto(acao, "qualquer texto")).toBe(false);
    const gate = assegurarAvaliacaoDoTextoFinal({
      ctx,
      textoFinal: "A consulta custa R$ 150.",
      avaliacaoPrevia: acao,
    });
    expect(gate.recalculado).toBe(true);
  });

  it("mesmo texto reaproveita a avaliação sem recalcular", () => {
    const ctx = ctxDe();
    const texto = "A consulta custa R$ 150.";
    const a = verificarRespostaFinal({ ctx, textoFinal: texto });
    const gate = assegurarAvaliacaoDoTextoFinal({ ctx, textoFinal: texto, avaliacaoPrevia: a });
    expect(gate.recalculado).toBe(false);
    expect(gate.motivo).toBe("avaliacao_valida");
  });

  it("sem avaliação prévia o gate avalia o texto final", () => {
    const gate = assegurarAvaliacaoDoTextoFinal({ ctx: ctxDe(), textoFinal: "Bom dia!" });
    expect(gate.motivo).toBe("sem_avaliacao_previa");
    expect(gate.resultado.tipoAvaliacao).toBe("answer_confidence");
  });
});
