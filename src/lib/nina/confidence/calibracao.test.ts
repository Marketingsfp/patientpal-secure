import { describe, expect, it } from "bun:test";
import {
  AjusteRecusado,
  calibrar,
  faixaDoScore,
  mesclarPolitica,
  type ErroCalibracao,
  type LinhaCalibracao,
} from "./calibracao";
import { POLITICA_PADRAO } from "./policy";

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
    ...p,
  };
}

function erro(i: number, p: Partial<ErroCalibracao> = {}): ErroCalibracao {
  return {
    id: `e${i}`,
    conversa_id: `c${i}`,
    mensagem_id: null,
    execucao_id: null,
    categoria: "informacao_incorreta",
    created_at: "2026-09-01T13:00:00Z",
    ...p,
  };
}

describe("FASE 9 — calibração", () => {
  it("classifica as faixas de confiança", () => {
    expect(faixaDoScore(96)).toBe("90_100");
    expect(faixaDoScore(80)).toBe("75_89");
    expect(faixaDoScore(60)).toBe("50_74");
    expect(faixaDoScore(10)).toBe("0_49");
  });

  it("cruza confiança alta com erro reportado e propõe subir o limite", () => {
    const decisoes = Array.from({ length: 30 }, (_, i) => decisao(i));
    const erros = Array.from({ length: 9 }, (_, i) => erro(i));
    const r = calibrar(decisoes, erros);
    expect(r.total).toBe(30);
    expect(r.altaConfiancaComErro).toBe(9);
    const alta = r.porFaixa.find((f) => f.faixa === "90_100")!;
    expect(alta.taxaErro).toBe(30);
    const proposta = r.propostas.find((p) => p.alvo === "limites.HIGH");
    expect(proposta?.tipo).toBe("AJUSTAR_LIMITE");
    expect(proposta?.valorSugerido).toBe(94);
    expect(proposta?.status).toBe("pendente");
  });

  it("não propõe nada quando a amostra é pequena ou o erro é raro", () => {
    const poucos = calibrar([decisao(1), decisao(2)], [erro(1)]);
    expect(poucos.propostas).toHaveLength(0);
    const saudavel = calibrar(
      Array.from({ length: 40 }, (_, i) => decisao(i)),
      [erro(1)],
    );
    expect(saudavel.propostas).toHaveLength(0);
  });

  it("propõe reforçar o peso do validador que aparece nos erros", () => {
    const decisoes = Array.from({ length: 30 }, (_, i) =>
      decisao(i, {
        score: 60,
        nivel: "LOW",
        validadores: [{ validator: "OfficialSourceValidator", status: "FAIL" }],
      }),
    );
    const erros = Array.from({ length: 12 }, (_, i) => erro(i));
    const r = calibrar(decisoes, erros);
    const p = r.propostas.find((x) => x.alvo === "pesos.OfficialSourceValidator");
    expect(p?.valorAtual).toBe(20);
    expect(p?.valorSugerido).toBe(25);
  });

  it("liga o erro pela mensagem e pela execução, não só pela conversa", () => {
    const r = calibrar(
      [decisao(1, { conversation_id: null, message_id: "msg-1" })],
      [erro(1, { conversa_id: null, mensagem_id: "msg-1" })],
    );
    expect(r.comErroReportado).toBe(1);
  });

  it("relaciona agendamento confirmado e resultado da conversa", () => {
    const r = calibrar(
      [decisao(1, { acao_solicitada: "criar_agendamento" })],
      [],
      [{ conversa_id: "c1", status: "resolvido", houveHandoff: false, agendamentoConfirmado: true }],
    );
    const alta = r.porFaixa.find((f) => f.faixa === "90_100")!;
    expect(alta.agendamentosConfirmados).toBe(1);
    expect(alta.conversasResolvidas).toBe(1);
  });

  it("aplica ajuste aprovado dentro dos limites permitidos", () => {
    const nova = mesclarPolitica(POLITICA_PADRAO, [{ alvo: "limites.HIGH", valor: 94 }]);
    expect(nova.limites.HIGH).toBe(94);
    expect(POLITICA_PADRAO.limites.HIGH).toBe(90);
  });

  it("recusa ajustes que enfraquecem a segurança", () => {
    expect(() =>
      mesclarPolitica(POLITICA_PADRAO, [{ alvo: "bloqueadoresAbsolutos.CONFLITO_DE_FONTE", valor: 0 }]),
    ).toThrow(AjusteRecusado);
    expect(() => mesclarPolitica(POLITICA_PADRAO, [{ alvo: "limites.MEDIUM", valor: 95 }])).toThrow(
      AjusteRecusado,
    );
    expect(() => mesclarPolitica(POLITICA_PADRAO, [{ alvo: "pesos.Inexistente", valor: 10 }])).toThrow(
      AjusteRecusado,
    );
  });

  it("toda proposta nasce pendente — nada é aplicado automaticamente", () => {
    const r = calibrar(
      Array.from({ length: 30 }, (_, i) => decisao(i)),
      Array.from({ length: 20 }, (_, i) => erro(i)),
    );
    expect(r.propostas.length).toBeGreaterThan(0);
    for (const p of r.propostas) expect(p.status).toBe("pendente");
  });
});
