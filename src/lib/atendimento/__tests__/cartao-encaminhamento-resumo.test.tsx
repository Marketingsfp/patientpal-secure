import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HandoffGroupCard, ResumoAvulsoCard } from "@/components/nina/ConversationEventGroup";
import { normalizarResumo } from "../handoff-resumo";
import { casarResumosComAvisos } from "../timeline-resumos";
import type { ResumoNaConversa } from "../resumo-retencao";
import type { GrupoHandoff } from "../timeline-grupos";

const EM = "2026-09-30T15:30:00.000Z";
const grupo: GrupoHandoff = {
  tipo: "HANDOFF", chave: "h1", criadoEm: EM, motivo: "patient_response_timeout", urgencia: null,
  protocolo: "MJ-645", filaInicial: null, filaNome: null, origem: "SISTEMA", status: "PROTOCOLO_INFORMADO",
  auditoria: { registrada: true, completa: true, faltando: [] }, eventoIds: [], marcadorIds: [],
  atribuicao: { tipo: "ATRIBUICAO", chave: "a1", criadoEm: EM, automatica: true, transferencia: false, atendenteNome: "JEAN TELEFONE" } as never,
};
const resumo = (payload: Record<string, unknown>, desfecho = "timeout_sem_resposta"): ResumoNaConversa => ({
  id: "r1", versao: 1, handoff_em: EM, desfecho, expira_em: "2026-10-07T15:30:00.000Z",
  payload: normalizarResumo({ intencao: "outro", ...payload }, { protocolo: "MJ-645" }),
});

describe("encaminhamento e resumo da Nina num cartão só", () => {
  it("resumo antigo (campos): um cartão, protocolo uma vez, origem/status/atribuição numa linha", () => {
    const html = renderToStaticMarkup(
      <HandoffGroupCard grupo={grupo} resumo={resumo({ motivo_contato: "Paciente não respondeu", situacao: "A Nina não coletou a demanda" })} />,
    );
    expect(html).toContain("Encaminhamento para atendimento humano");
    expect(html).toContain("Resumo da Nina");
    expect(html).toContain("Motivo do contato");
    expect(html.match(/MJ-645/g)?.length).toBe(1); // sem repetir o protocolo
    expect(html).not.toContain("purple"); // sem a cor própria do cartão antigo
    // Uma linha só para origem, status, atribuição e atendente.
    expect(html.match(/Origem:/g)?.length).toBe(1);
    expect(html).toMatch(/Origem:[\s\S]*Status:[\s\S]*Atribuição:[\s\S]*Atendente:/);
  });

  it("resumo novo: texto corrido em parágrafos dentro do mesmo cartão", () => {
    const html = renderToStaticMarkup(
      <HandoffGroupCard grupo={grupo} resumo={resumo({ texto_resumo: "Primeiro parágrafo completo.\n\nSegundo parágrafo completo." })} />,
    );
    expect(html).toContain("Primeiro parágrafo completo.");
    expect(html).toContain("Segundo parágrafo completo.");
    expect(html).toContain("uso interno");
  });

  it("sem resumo, o cartão de encaminhamento fica como sempre foi", () => {
    const html = renderToStaticMarkup(<HandoffGroupCard grupo={grupo} />);
    expect(html).toContain("Encaminhamento para atendimento humano");
    expect(html).not.toContain("Resumo da Nina");
  });

  it("resumo sem aviso próximo vira cartão próprio, no mesmo estilo", () => {
    const html = renderToStaticMarkup(<ResumoAvulsoCard resumo={resumo({ motivo_contato: "Agendou" }, "agendamento_concluido")} />);
    expect(html).toContain("Conclusão da Nina");
    expect(html).toContain("Resumo da Nina");
    expect(html).not.toContain("purple");
  });

  it("cada aviso recebe no máximo um resumo; o que sobra fica solto", () => {
    const itens = [{ at: Date.parse(EM), tipo: "aviso" }, { at: Date.parse(EM) + 20 * 60_000, tipo: "aviso" }];
    const r1 = resumo({});
    const r2 = { ...resumo({}), id: "r2" };
    const r3 = { ...resumo({}), id: "r3", handoff_em: "2026-09-30T18:00:00.000Z" };
    const { anexos, soltos } = casarResumosComAvisos(itens, [r1, r2, r3], (i) => i.tipo === "aviso");
    expect([...anexos.values()].map((r) => r.id)).toEqual(["r1"]);
    expect(soltos.map((r) => r.id)).toEqual(["r2", "r3"]);
  });
});
