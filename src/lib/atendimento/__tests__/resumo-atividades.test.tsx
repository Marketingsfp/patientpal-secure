import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MensagensAnterioresResumo } from "@/components/nina/MensagensAnterioresResumo";
import { normalizarResumo } from "../handoff-resumo";
import { acaoConcluida, acoesSolicitadas, normalizarAtividades } from "../resumo-atividades";
import { filtrarPainelNoPrazo, montarPainelResumo, type ResumoRetido } from "../resumo-retencao";

const agora = Date.parse("2026-09-20T15:00:00Z");
const inicioAtual = "2026-09-20T14:00:00Z";
function linha(extra: Partial<ResumoRetido> = {}): ResumoRetido {
  return {
    id: "anterior",
    versao: 1,
    handoff_em: "2026-09-17T12:10:00Z",
    atendimento_inicio: "2026-09-17T12:00:00Z",
    status: "ok",
    payload: normalizarResumo({
      motivo_contato: "Deseja informações sobre neurologista",
      ja_informado: ["CATÁLOGO ANTIGO: médicos, dias, critérios e R$ 120,00"],
      pendencias: ["Conferir preço"],
      situacao: "Atendimento encerrado pela equipe.",
      proxima_acao: "Consultar agenda",
    }),
    erro: null,
    situacao: "archived",
    desfecho: "conversa_resolvida",
    updated_at: "2026-09-17T12:11:00Z",
    ...extra,
  };
}

const agendamento = () =>
  linha({
    id: "agendou",
    desfecho: "agendamento_concluido",
    payload: normalizarResumo(
      { atividades_paciente: [{ tipo: "agendamento", assunto: "mamografia" }] },
      { agendamentoReal: { servico: "Mamografia", data: "18/09/2026", hora: "08:00" } },
    ),
  });

describe("ações dos atendimentos anteriores", () => {
  it("apresenta a procura do paciente e não copia respostas antigas, pendências ou situação", () => {
    const painel = montarPainelResumo([linha()], inicioAtual, false, agora);
    expect(painel.anteriores[0].acoes).toEqual(["Buscou informações sobre neurologista."]);
    const html = renderToStaticMarkup(
      <MensagensAnterioresResumo atendimentos={painel.anteriores} />,
    );
    expect(html).toContain("Atendimentos anteriores");
    expect(html).toContain("17/09/2026");
    expect(html).toContain("Buscou informações sobre neurologista.");
    for (const antigo of [
      "CATÁLOGO ANTIGO",
      "Conferir preço",
      "Consultar agenda",
      "encerrado",
      "Mensagens anteriores",
    ])
      expect(html).not.toContain(antigo);
  });

  it("mantém pedidos distintos do legado sem transformá-los em conclusão", () => {
    const r = normalizarResumo({
      motivo_contato: "Deseja informações sobre cardiologista e agendar consulta de ortopedia.",
    });
    expect(acoesSolicitadas(r, [])).toEqual([
      "Buscou informações sobre cardiologista e solicitou agendamento de consulta de ortopedia.",
    ]);
  });

  it("separa assuntos procurados pelo paciente em frases curtas", () => {
    const r = normalizarResumo({
      atividades_paciente: [
        { tipo: "informacao", assunto: "neurologista" },
        { tipo: "agendamento", assunto: "mamografia" },
      ],
    });
    expect(acoesSolicitadas(r, [])).toEqual([
      "Buscou informações sobre neurologista.",
      "Solicitou agendamento de mamografia.",
    ]);
  });

  it("IA não pode atestar agendamento, cancelamento ou pagamento", () => {
    const r = normalizarResumo({
      atividades_paciente: [
        { tipo: "agendou", assunto: "mamografia" },
        { tipo: "pagou", assunto: "consulta" },
        { tipo: "cancelou", assunto: "ortopedia" },
        { tipo: "agendamento", assunto: "mamografia" },
      ],
      agendamento_confirmado: { servico: "Mamografia" },
    });
    expect(r.agendamento_confirmado).toBeNull();
    expect(acoesSolicitadas(r, [])).toEqual(["Solicitou agendamento de mamografia."]);
    expect(acaoConcluida(r, "conversa_resolvida")).toBeNull();
  });

  it("preserva agendamento realizado antes do encerramento, com data própria e data da consulta", () => {
    const encerramento = linha({
      id: "encerrou",
      versao: 2,
      handoff_em: "2026-09-19T12:00:00Z",
      payload: normalizarResumo({
        atividades_paciente: [
          { tipo: "agendamento", assunto: "mamografia" },
          { tipo: "informacao", assunto: "neurologista" },
          { tipo: "agendamento", assunto: "ortopedia" },
        ],
      }),
    });
    const painel = montarPainelResumo([agendamento(), encerramento], inicioAtual, false, agora);
    expect(painel.anteriores.map((a) => [a.data, a.acoes])).toEqual([
      [
        "2026-09-19T12:00:00Z",
        ["Buscou informações sobre neurologista.", "Solicitou agendamento de ortopedia."],
      ],
      ["2026-09-17T12:10:00Z", ["Agendou Mamografia para 18/09/2026 às 08:00."]],
    ]);
    expect(painel.atual).toBeNull();
  });

  it("não duplica o mesmo agendamento ao atualizar o resumo do ciclo", () => {
    const repetido = {
      ...agendamento(),
      id: "atualizou",
      versao: 2,
      handoff_em: "2026-09-17T12:30:00Z",
    };
    const painel = montarPainelResumo([repetido, agendamento()], inicioAtual, false, agora);
    expect(painel.anteriores).toHaveLength(1);
    expect(painel.anteriores[0].data).toBe("2026-09-17T12:10:00Z");
  });

  it("atualização posterior não renova o prazo de sete dias da ação concluída", () => {
    const encerramento = linha({ id: "encerrou", versao: 2, handoff_em: "2026-09-19T12:00:00Z" });
    const painel = montarPainelResumo([agendamento(), encerramento], inicioAtual, false, agora);
    const depois = Date.parse("2026-09-24T12:10:00Z");
    expect(filtrarPainelNoPrazo(painel, depois)?.anteriores.map((a) => a.id)).toEqual(["encerrou"]);
    expect(
      montarPainelResumo([agendamento(), encerramento], inicioAtual, false, depois).anteriores.map(
        (a) => a.id,
      ),
    ).toEqual(["encerrou"]);
  });

  it("distingue pedido de cancelamento de cancelamento registrado", () => {
    const r = normalizarResumo({
      atividades_paciente: [{ tipo: "cancelamento", assunto: "consulta" }],
    });
    expect(acoesSolicitadas(r, [])).toEqual(["Solicitou cancelamento de consulta."]);
    expect(acaoConcluida(r, "handoff_humano")).toBeNull();
    expect(acaoConcluida(r, "cancelamento")).toBe("Cancelou um agendamento.");
  });

  it("não repete atividades nem aceita tipos inválidos ou assuntos vazios", () => {
    expect(
      normalizarAtividades([
        null,
        "texto",
        { tipo: "toString", assunto: "não" },
        { tipo: "informacao", assunto: "  " },
        { tipo: "informacao", assunto: " neurologista " },
        { tipo: "informacao", assunto: "NEUROLOGISTA" },
        { tipo: "atendente", assunto: "ignorado" },
      ]),
    ).toEqual([
      { tipo: "informacao", assunto: "neurologista" },
      { tipo: "atendente", assunto: "" },
    ]);
  });

  it("histórico não promove agendamento ou pedido de outro ciclo a atendimento atual", () => {
    const atual = linha({
      id: "atual",
      situacao: "active",
      desfecho: "handoff_humano",
      atendimento_inicio: inicioAtual,
      handoff_em: inicioAtual,
    });
    const painel = montarPainelResumo([agendamento(), atual], inicioAtual, false, agora);
    expect(painel.atual?.id).toBe("atual");
    expect(painel.atual?.payload?.agendamento_confirmado).toBeNull();
    expect(painel.atual?.payload?.pendencias).toEqual(["Conferir preço"]);
    expect(painel.anteriores[0].acoes).toEqual(["Agendou Mamografia para 18/09/2026 às 08:00."]);
  });
});
