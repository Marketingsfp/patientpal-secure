import { describe, expect, it } from "bun:test";
import { inserirResumosNaTimeline } from "../timeline-resumos";
import { selecionarResumosDaConversa, type ResumoRetido } from "../resumo-retencao";
import { paragrafosDoResumo, textoCorrido, normalizarResumo } from "../handoff-resumo";
import { ehConclusaoDaNina } from "../resumo-desfecho";

const t = (min: number) => new Date(Date.UTC(2026, 8, 30, 15, min)).getTime();
const payload = (extra: Record<string, unknown> = {}) =>
  normalizarResumo({ intencao: "consulta", motivo_contato: "Quer consulta", ...extra });
const linha = (id: string, min: number, over: Partial<ResumoRetido> = {}): ResumoRetido => ({
  id,
  versao: 1,
  handoff_em: new Date(t(min)).toISOString(),
  atendimento_inicio: new Date(t(0)).toISOString(),
  status: "ok",
  payload: payload(),
  erro: null,
  situacao: "active",
  desfecho: "handoff_humano",
  updated_at: new Date(t(min)).toISOString(),
  ...over,
});
const AGORA = t(60);

describe("resumo da Nina dentro da conversa", () => {
  const itens = [
    { kind: "msg", at: t(1), id: "m1" },
    { kind: "grupo", at: t(10), tipo: "HANDOFF", id: "h1" },
    { kind: "msg", at: t(12), id: "m2" },
    { kind: "grupo", at: t(30), tipo: "HANDOFF", id: "h2" },
    { kind: "msg", at: t(35), id: "m3" },
  ];
  const aviso = (i: (typeof itens)[number]) => i.kind === "grupo" && i.tipo === "HANDOFF";

  it("cada resumo entra logo depois do aviso de encaminhamento da sua transferência", () => {
    const resumos = selecionarResumosDaConversa([linha("r1", 10), linha("r2", 30)], AGORA);
    const r = inserirResumosNaTimeline(itens as never, resumos, aviso as never);
    expect(r.map((i: any) => (i.kind === "resumo" ? `resumo:${i.resumo.id}` : i.id))).toEqual([
      "m1",
      "h1",
      "resumo:r1",
      "m2",
      "h2",
      "resumo:r2",
      "m3",
    ]);
  });

  it("sem aviso próximo, entra pela hora da conclusão; nunca fica fixo no topo", () => {
    const resumos = selecionarResumosDaConversa(
      [linha("r3", 55, { desfecho: "agendamento_concluido" })],
      AGORA,
    );
    const r = inserirResumosNaTimeline(itens as never, resumos, aviso as never);
    expect(r.map((i: any) => (i.kind === "resumo" ? "resumo" : i.id))).toEqual([
      "m1",
      "h1",
      "m2",
      "h2",
      "m3",
      "resumo",
    ]);
  });

  it("um resumo por conclusão: versões repetidas e resumos de resolução humana não entram", () => {
    const linhas = [
      linha("a", 10, { versao: 1 }),
      linha("b", 10, { versao: 2 }), // nova versão do mesmo momento: vale a mais recente
      linha("c", 20, { desfecho: "conversa_resolvida" }), // ação de pessoa, não conclusão da Nina
      linha("d", 25, { status: "erro", payload: null }), // não gerado ainda
    ];
    expect(selecionarResumosDaConversa(linhas, AGORA).map((r) => r.id)).toEqual(["b"]);
    expect(ehConclusaoDaNina("timeout_sem_resposta")).toBe(true);
    expect(ehConclusaoDaNina("conversa_resolvida")).toBe(false);
  });

  it("vence depois de sete dias", () => {
    const velho = linha("v", 0, { handoff_em: new Date(AGORA - 8 * 86_400_000).toISOString() });
    expect(selecionarResumosDaConversa([velho], AGORA)).toEqual([]);
  });
});

describe("texto do resumo", () => {
  it("texto corrido mantém os parágrafos e não corta frases", () => {
    const longo =
      "A paciente pediu consulta. ".repeat(40).trim() + "\n\n\n\nSegundo parágrafo completo.";
    const t = textoCorrido(longo)!;
    expect(t).toContain("\n\nSegundo parágrafo completo.");
    expect(t).not.toContain("\n\n\n");
    expect(t.length).toBeGreaterThan(900); // acima dos antigos 240 caracteres
  });

  it("descarta JSON e identificadores internos", () => {
    expect(textoCorrido('{"a":1}')).toBeNull();
    expect(textoCorrido("Conversa 3f2b8c1e-9d4a-4b6e-8a1c-2f7d5e9a0b12 encerrada")).toBe(
      "Conversa  encerrada",
    );
  });

  it("o resumo novo aparece em parágrafos; o antigo cai nos blocos de sempre", () => {
    const novo = normalizarResumo({
      motivo_contato: "x",
      texto_resumo: "Primeiro parágrafo.\n\nSegundo parágrafo.",
    });
    expect(paragrafosDoResumo(novo)).toEqual(["Primeiro parágrafo.", "Segundo parágrafo."]);
    const antigo = normalizarResumo({
      motivo_contato: "Quer marcar cardiologia",
      ja_informado: ["Horários do Dr. Alex"],
    });
    expect(paragrafosDoResumo(antigo).join(" ")).toContain("Quer marcar cardiologia");
    expect(paragrafosDoResumo(antigo).join(" ")).toContain("Horários do Dr. Alex");
  });
});
