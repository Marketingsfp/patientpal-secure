import { describe, expect, it } from "bun:test";
import { historicoParaConsultaAgenda } from "../consulta-agenda-historico";
import { autorizarConsultaAgenda } from "../consulta-agenda";

const medico = { id: "11111111-1111-4111-8111-111111111111", nome: "Alex Louza" };
const contexto = {
  conversaId: "conversa-atual",
  inicioSessao: "2026-09-13T12:00:00Z",
  corteMemoria: Date.parse("2026-09-13T10:00:00Z"),
  teste: true,
  idsDoTurno: new Set(["mensagem-atual"]),
};
const oferta = {
  id: "oferta",
  conversa_id: "conversa-atual",
  direction: "out",
  body: "Quer que eu consulte as vagas do Dr. Alex Louza?",
  status: "sent",
  created_at: "2026-09-13T12:01:00Z",
  is_teste: true,
};

describe("Histórico para consulta de vagas", () => {
  it("preserva oferta ao final de resposta longa, independente do resumo do modelo", () => {
    const longa = { ...oferta, body: "Informação publicada. ".repeat(100) + oferta.body };
    const historico = historicoParaConsultaAgenda([longa], contexto);
    expect(historico[0]?.content).toBe(longa.body);
    expect(autorizarConsultaAgenda({ mensagemAtual: "sim", historico }, medico).permitido).toBe(
      true,
    );
  });

  it.each(["failed", "pending", "queued", "system", "sending", ""])(
    "não usa oferta com status %s para autorizar vagas",
    (status) => {
      const historico = historicoParaConsultaAgenda([{ ...oferta, status }], contexto);
      expect(historico).toEqual([]);
      expect(autorizarConsultaAgenda({ mensagemAtual: "sim", historico }, medico).permitido).toBe(
        false,
      );
    },
  );

  it.each(["sent", "delivered", "read"])("aceita mensagem enviada com status %s", (status) => {
    expect(historicoParaConsultaAgenda([{ ...oferta, status }], contexto)).toHaveLength(1);
  });

  it("não reutiliza ofertas de sessão encerrada, outra conversa ou outro ambiente", () => {
    expect(
      historicoParaConsultaAgenda(
        [
          { ...oferta, created_at: "2026-09-13T11:59:00Z" },
          { ...oferta, conversa_id: "outra-conversa" },
          { ...oferta, is_teste: false },
          { ...oferta, created_at: "inválida" },
        ],
        contexto,
      ),
    ).toEqual([]);
  });

  it("exclui entrada atual por ID e ordena as mensagens reais sem alterar o conteúdo", () => {
    const entrada = {
      ...oferta,
      id: "pedido",
      direction: "in",
      status: "received",
      body: "Tem vagas?",
      created_at: "2026-09-13T12:00:10Z",
    };
    const atual = {
      ...entrada,
      id: "mensagem-atual",
      body: "sim",
      created_at: "2026-09-13T12:02:00Z",
    };
    expect(historicoParaConsultaAgenda([atual, oferta, entrada], contexto)).toEqual([
      { role: "user", content: "Tem vagas?" },
      { role: "assistant", content: oferta.body },
    ]);
  });

  it("não usa histórico sem sessão identificada e respeita o TTL mais recente", () => {
    expect(historicoParaConsultaAgenda([oferta], { ...contexto, inicioSessao: null })).toEqual([]);
    expect(historicoParaConsultaAgenda([oferta], { ...contexto, conversaId: null })).toEqual([]);
    expect(
      historicoParaConsultaAgenda([oferta], {
        ...contexto,
        corteMemoria: Date.parse("2026-09-13T12:02:00Z"),
      }),
    ).toEqual([]);
  });
});
