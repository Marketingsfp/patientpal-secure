/**
 * FASE 7 — métricas, calibração e o que o painel pode afirmar.
 *
 * Contraexemplos exigidos:
 *  - resposta 98 + ação 20 na MESMA mensagem não vira média 59 nem duas mensagens;
 *  - clínica com limite alto em 98 não recebe proposta de "endurecer" para 94;
 *  - período sem amostra não aparece como calibração comprovadamente boa.
 */
import { describe, expect, it } from "bun:test";
import { calcularMetricasConfiabilidade, type LinhaDecisaoMetrica } from "./metricas";
import { calibrar, AMOSTRA_MINIMA, type LinhaCalibracao } from "./calibracao";
import { separarAvaliacoes } from "./escopo-metricas";
import { POLITICA_PADRAO } from "./policy";

function linha(p: Partial<LinhaDecisaoMetrica> = {}): LinhaDecisaoMetrica {
  return {
    id: p.id ?? crypto.randomUUID(),
    created_at: p.created_at ?? "2026-09-05T12:00:00.000Z",
    ambiente: p.ambiente ?? "producao",
    conversation_id: p.conversation_id ?? "conv-1",
    score: p.score ?? 95,
    nivel: p.nivel ?? null,
    decisao: p.decisao ?? "ALLOW",
    acao: p.acao ?? null,
    intencao: p.intencao ?? "informar_valor",
    categorias: p.categorias ?? ["valor"],
    bloqueadores: p.bloqueadores ?? [],
    reason_codes: p.reason_codes ?? [],
    validadores: p.validadores ?? [],
    ferramentas: p.ferramentas ?? [],
    data_local: p.data_local ?? "2026-09-05",
    dia_semana: p.dia_semana ?? 6,
    periodo: p.periodo ?? "DENTRO_DO_HORARIO",
    ...(p as Partial<LinhaDecisaoMetrica>),
  } as LinhaDecisaoMetrica;
}

function decisao(i: number, p: Partial<LinhaCalibracao> = {}): LinhaCalibracao {
  return {
    id: `d${i}`,
    created_at: "2026-09-01T12:00:00Z",
    ambiente: "producao",
    conversation_id: `c${i}`,
    message_id: `m${i}`,
    execucao_id: null,
    score: 95,
    nivel: "HIGH",
    decisao: "ALLOW",
    resultado_final: "resposta_liberada",
    acao_solicitada: "responder_informacao",
    bloqueadores: [],
    reason_codes: [],
    categorias: ["preco"],
    validadores: [],
    avaliacao: "answer_confidence",
    ...p,
  };
}

describe("FASE 7 — separação de escopo", () => {
  it("não mistura resposta e ação da mesma mensagem na mesma média", () => {
    const m = calcularMetricasConfiabilidade([
      linha({
        id: "a",
        score: 98,
        nivel: "HIGH",
        decisao: "ALLOW",
        avaliacao: "answer_confidence",
        outgoing_message_id: "out-1",
      } as Partial<LinhaDecisaoMetrica>),
      linha({
        id: "b",
        score: 20,
        nivel: "LOW",
        decisao: "BLOCK_ACTION",
        avaliacao: "action_safety",
        outgoing_message_id: "out-1",
      } as Partial<LinhaDecisaoMetrica>),
    ]);

    expect(m.scoreMedio).toBe(98);
    expect(m.scoreMedio).not.toBe(59);
    expect(m.total).toBe(1);
    expect(m.escopo.mensagens).toBe(1);
    expect(m.escopo.avaliacoesResposta).toBe(1);
    expect(m.escopo.avaliacoesAcao).toBe(1);
    expect(m.seguranca.avaliadas).toBe(1);
    expect(m.seguranca.scoreMedio).toBe(20);
    expect(m.acoesBloqueadas).toBe(1);
    expect(m.distribuicao.LOW).toBe(0);
  });

  it("conta a mesma saída uma vez só quando há registro repetido", () => {
    const s = separarAvaliacoes([
      { id: "1", avaliacao: "answer_confidence", outgoing_message_id: "o1", created_at: "2026-01-01T10:00:00Z" },
      { id: "2", avaliacao: "answer_confidence", outgoing_message_id: "o1", created_at: "2026-01-01T11:00:00Z" },
    ]);
    expect(s.respostas).toHaveLength(1);
    expect(s.respostas[0]!.id).toBe("2");
    expect(s.duplicadosDescartados).toBe(1);
  });

  it("registro antigo sem tipo entra como avaliação da resposta", () => {
    const s = separarAvaliacoes([{ id: "1", message_id: "m1" }]);
    expect(s.respostas).toHaveLength(1);
    expect(s.semTipo).toBe(1);
    expect(s.seguranca).toHaveLength(0);
  });

  it("avisa quando o recorte mistura ambientes", () => {
    const m = calcularMetricasConfiabilidade([
      linha({ id: "a", ambiente: "producao" }),
      linha({ id: "b", ambiente: "homologacao" }),
    ]);
    expect(m.escopo.comparavel).toBe(false);
    expect(m.escopo.ambientes).toEqual(["homologacao", "producao"]);
  });
});

describe("FASE 7 — calibração usa a configuração vigente", () => {
  const errosMuitos = Array.from({ length: 30 }, (_, i) => ({
    id: `e${i}`,
    conversa_id: `c${i}`,
    mensagem_id: `m${i}`,
    execucao_id: null,
    categoria: "informacao_incorreta",
    created_at: "2026-09-01T13:00:00Z",
    status: "confirmado",
  }));
  const decisoes = Array.from({ length: 30 }, (_, i) => decisao(i));

  it("clínica com limite alto em 98 não recebe proposta de baixar para 94", () => {
    const politica = {
      ...POLITICA_PADRAO,
      limites: { ...POLITICA_PADRAO.limites, HIGH: 98 },
    };
    const r = calibrar(decisoes, errosMuitos, [], politica, {
      origemPolitica: "clinica",
      configId: "cfg-1",
    });
    const proposta = r.propostas.find((p) => p.alvo === "limites.HIGH");
    expect(proposta).toBeUndefined();
    expect(r.politicaAplicada.limiteAlta).toBe(98);
    expect(r.politicaAplicada.origem).toBe("clinica");
    expect(r.politicaAplicada.configId).toBe("cfg-1");
  });

  it("com limite padrão a proposta sobe o valor realmente vigente", () => {
    const r = calibrar(decisoes, errosMuitos, [], POLITICA_PADRAO);
    const proposta = r.propostas.find((p) => p.alvo === "limites.HIGH");
    expect(proposta).toBeDefined();
    expect(Number(proposta!.valorAtual)).toBe(POLITICA_PADRAO.limites.HIGH);
    expect(Number(proposta!.valorSugerido)).toBeGreaterThan(POLITICA_PADRAO.limites.HIGH);
    expect(proposta!.efeito).toContain(String(proposta!.valorSugerido));
    expect(proposta!.status).toBe("pendente");
  });

  it("ausência de amostra é inconclusiva, não comprovação de boa calibração", () => {
    const r = calibrar([], [], []);
    expect(r.propostas).toHaveLength(0);
    expect(r.conclusao.conclusiva).toBe(false);
    expect(r.conclusao.amostraMinima).toBe(AMOSTRA_MINIMA);
    expect(r.conclusao.motivo).toContain("Nenhuma resposta avaliada");
  });

  it("amostra pequena também é inconclusiva", () => {
    const r = calibrar([decisao(1), decisao(2)], [], []);
    expect(r.conclusao.conclusiva).toBe(false);
  });

  it("segurança da ação não entra na calibração dos limites de resposta", () => {
    const r = calibrar(
      [
        decisao(1, { avaliacao: "answer_confidence", score: 98, outgoing_message_id: "o1" }),
        decisao(2, {
          avaliacao: "action_safety",
          score: 20,
          decisao: "BLOCK_ACTION",
          outgoing_message_id: "o1",
        }),
      ],
      [],
      [],
    );
    expect(r.total).toBe(1);
    expect(r.porFaixa.find((f) => f.faixa === "90_100")!.decisoes).toBe(1);
    expect(r.porFaixa.find((f) => f.faixa === "0_49")!.decisoes).toBe(0);
  });
});
