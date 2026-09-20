import { describe, expect, it } from "bun:test";
import {
  filtrarPainelNoPrazo,
  limiteTranscricaoResumo,
  montarPainelResumo,
  resumoNoPrazo,
  type ResumoRetido,
} from "../resumo-retencao";
import { normalizarResumo } from "../handoff-resumo";
import { ajustarResumoPorDesfecho } from "../resumo-desfecho";

const agora = Date.parse("2026-09-20T15:00:00Z");
const ciclo = "2026-09-20T14:00:00Z";
function linha(p: Partial<ResumoRetido> = {}): ResumoRetido {
  return {
    id: "atual",
    versao: 3,
    handoff_em: "2026-09-20T14:30:00Z",
    atendimento_inicio: ciclo,
    status: "ok",
    erro: null,
    situacao: "active",
    desfecho: "handoff_humano",
    updated_at: "2026-09-20T14:31:00Z",
    payload: normalizarResumo({
      motivo_contato: "Marcar ortopedia",
      pendencias: ["Enviar recibo"],
      proxima_acao: "Enviar recibo solicitado",
      situacao: "Aguarda equipe",
      ja_informado: ["Valor informado"],
    }),
    ...p,
  };
}
const anterior = () =>
  linha({
    id: "anterior",
    versao: 2,
    situacao: "archived",
    atendimento_inicio: "2026-09-18T12:00:00Z",
    handoff_em: "2026-09-18T12:10:00Z",
  });

describe("retenção e separação dos atendimentos", () => {
  it("vence exatamente em sete dias, sem depender de updated_at", () => {
    expect(resumoNoPrazo("2026-09-13T15:00:00.001Z", agora)).toBe(true);
    expect(resumoNoPrazo("2026-09-13T15:00:00Z", agora)).toBe(false);
    expect(
      montarPainelResumo([linha({ handoff_em: "2026-09-12T15:00:00Z" })], ciclo, false, agora)
        .atual,
    ).toBeNull();
  });
  it("data inválida/futura não vira resumo vigente", () => {
    expect(resumoNoPrazo("inválida", agora)).toBe(false);
    expect(resumoNoPrazo("2026-09-21T15:00:00Z", agora)).toBe(false);
  });
  it("reabertura mostra histórico datado sem promover pendências antigas", () => {
    const p = montarPainelResumo([anterior()], ciclo, false, agora);
    expect(p.atual).toBeNull();
    expect(p.anteriores).toHaveLength(1);
    expect(p.anteriores[0].data).toBe("2026-09-18T12:10:00Z");
    expect(JSON.stringify(p.anteriores)).not.toContain("Enviar recibo");
    expect(p.anteriores[0]).not.toHaveProperty("pendencias");
    expect(p.anteriores[0]).not.toHaveProperty("proxima_acao");
  });
  it("só última versão válida de cada atendimento aparece no histórico", () => {
    const p = montarPainelResumo(
      [
        anterior(),
        linha(),
        { ...anterior(), id: "velho", versao: 1, handoff_em: "2026-09-18T12:05:00Z" },
      ],
      ciclo,
      false,
      agora,
    );
    expect(p.atual?.id).toBe("atual");
    expect(p.anteriores.map((a) => a.id)).toEqual(["anterior"]);
  });
  it("versão superada do último ciclo não aparece em mensagens anteriores", () => {
    expect(montarPainelResumo([linha({ situacao: "superseded" })], ciclo, false, agora)).toEqual({
      atual: null,
      anteriores: [],
    });
  });
  it("resumo active de outro ciclo nunca vira situação atual", () => {
    const p = montarPainelResumo([{ ...anterior(), situacao: "active" }], ciclo, false, agora);
    expect(p.atual).toBeNull();
    expect(p.anteriores).toHaveLength(1);
  });
  it("resolução limpa toda pendência e próxima ação, inclusive fora de agendamento", () => {
    const p = montarPainelResumo([linha()], ciclo, true, agora);
    expect(p.atual?.payload?.pendencias).toEqual([]);
    expect(p.atual?.payload?.proxima_acao).toBeNull();
    expect(ajustarResumoPorDesfecho(linha().payload!, "conversa_resolvida").pendencias).toEqual([]);
  });
  it("pendência não resolvida desaparece no prazo, inclusive com o chat aberto", () => {
    const p = montarPainelResumo([linha(), anterior()], ciclo, false, agora);
    const depois = Date.parse("2026-09-27T14:30:00Z");
    expect(filtrarPainelNoPrazo(p, depois)).toBeNull();
  });
  it("vencer histórico não apaga o resumo atual ainda válido", () => {
    const p = montarPainelResumo([linha(), anterior()], ciclo, false, agora);
    const limpo = filtrarPainelNoPrazo(p, Date.parse("2026-09-25T12:10:00Z"));
    expect(limpo?.atual?.id).toBe("atual");
    expect(limpo?.anteriores).toEqual([]);
  });
  it("contexto da IA começa no ciclo atual ou no corte de sete dias", () => {
    expect(limiteTranscricaoResumo(ciclo, agora)).toBe("2026-09-20T14:00:00.000Z");
    expect(limiteTranscricaoResumo("2026-09-01T00:00:00Z", agora)).toBe("2026-09-13T15:00:00.000Z");
  });
});
