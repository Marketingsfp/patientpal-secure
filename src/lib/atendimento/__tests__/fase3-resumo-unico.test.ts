/**
 * FASE 3 — regra de regressão: um handoff da Nina tem UMA única visualização
 * detalhada do resumo (o card roxo, alimentado por `atend_handoff_resumos`).
 * A timeline só pode conter o evento cronológico compacto.
 *
 * O teste usa exatamente a função de apresentação que a timeline aplica
 * (`textoMarcadorSistema`), sem nenhuma consulta extra ao banco.
 */
import { describe, expect, it } from "bun:test";
import { textoMarcadorSistema } from "../marcador-handoff";

type ItemTimeline = { tipo: "mensagem"; enviada_por: string; body: string };

/** Texto detalhado = repete o resumo/motivo/fila do handoff. */
function pareceResumoDetalhado(texto: string): boolean {
  return /Resumo:|Posição na fila|Motivo:/.test(texto);
}

/** Quantos resumos detalhados a timeline renderiza (deve ser sempre 0). */
function resumosDetalhadosNaTimeline(itens: ItemTimeline[]): number {
  return itens
    .map((i) => (i.enviada_por === "sistema" ? textoMarcadorSistema(i.body) : i.body))
    .filter(pareceResumoDetalhado).length;
}

function marcador(setor: string, motivo: string, resumo: string): ItemTimeline {
  return {
    tipo: "mensagem",
    enviada_por: "sistema",
    body:
      `🔁 Conversa transferida da Nina para atendimento humano · Setor: ${setor}` +
      ` · Motivo: ${motivo} · Posição na fila: 2\nResumo: ${resumo}`,
  };
}

const CENARIOS: Array<[string, ItemTimeline[]]> = [
  ["A — agendamento", [marcador("Recepção", "agendamento", "quer marcar cardiologia terça.")]],
  ["B — dúvida/informação", [marcador("Recepção", "informacao", "perguntou preço de ultrassom.")]],
  [
    "C — insatisfação / handoff manual da Nina",
    [marcador("Supervisão", "patient_request", "paciente insatisfeito com atraso.")],
  ],
  [
    "D — conversa antiga (sem setor no marcador)",
    [
      {
        tipo: "mensagem",
        enviada_por: "sistema",
        body:
          "🔁 Conversa transferida da Nina para atendimento humano · Motivo: legado" +
          " · Posição na fila: 1\nResumo: registro antigo salvo antes da nova regra.",
      },
    ],
  ],
];

describe("FASE 3 — resumo detalhado único", () => {
  for (const [nome, itens] of CENARIOS) {
    it(`cenário ${nome}: timeline sem resumo detalhado`, () => {
      expect(resumosDetalhadosNaTimeline(itens)).toBe(0);
      expect(textoMarcadorSistema(itens[0]!.body)).toContain(
        "Transferida para atendimento humano",
      );
    });
  }

  it("cenário E/F — recarregar a página e Realtime não recriam duplicação", () => {
    // Realtime pode entregar a mesma linha de sistema novamente; a regra de
    // apresentação é pura e idempotente, então o resultado não muda.
    const item = marcador("Recepção", "agendamento", "quer marcar cardiologia terça.");
    const primeiraCarga = textoMarcadorSistema(item.body);
    const aposRealtime = textoMarcadorSistema(item.body);
    expect(aposRealtime).toBe(primeiraCarga);
    expect(resumosDetalhadosNaTimeline([item, item])).toBe(0);
  });

  it("eventos operacionais da timeline continuam intactos", () => {
    const operacionais = [
      "🧾 Handoff realizado pela Nina · Protocolo: MJ-4 · Destino: Recepção",
      "Conversa atribuída a Tuane",
      "Conversa encerrada e resolvida por Tuane",
    ];
    for (const t of operacionais) expect(textoMarcadorSistema(t)).toBe(t);
  });
});
