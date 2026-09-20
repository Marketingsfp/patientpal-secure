import { describe, expect, it } from "bun:test";
import { agruparTimeline, type EventoTimeline, type GrupoHandoff } from "../timeline-grupos";
import { posicionarHandoffAposAviso, type RegistroOrdemHandoff } from "../timeline-handoff";
import { anteciparReabertura } from "../timeline-reabertura";

const base = Date.parse("2026-09-20T13:02:00-03:00");
const iso = (s: number) => new Date(base + s * 1000).toISOString();
type Item = RegistroOrdemHandoff & { id: string };
const msg = (id: string, s: number, direction = "out", status = "sent"): Item => ({
  id,
  em: base + s * 1000,
  mensagem: {
    id,
    direction,
    status,
    enviada_por: direction === "out" ? "sistema" : "paciente",
    body: "Vou encaminhar. Protocolo do atendimento: MJ-112",
  },
});
const ev = (
  id: string,
  s: number,
  evento: string,
  detalhes?: Record<string, unknown>,
): EventoTimeline => ({ id, created_at: iso(s), evento, detalhes });
const eventos = (avisoId: string | null = "aviso"): EventoTimeline[] => [
  ev("handoff", 12, "HANDOFF_SOLICITADO", { solicitado_por: "IA" }),
  ev("fila", 12.1, "ENTROU_NA_FILA", { posicao: 49 }),
  ev("protocolo", 12.2, "HANDOFF_SOLICITADO", {
    handoff_event_id: "handoff",
    protocol_number: "MJ-112",
  }),
  ev("informado", 16, "ASSUMIDA", {
    protocol_number: "MJ-112",
    protocolo_informado: true,
    message_id: avisoId,
  }),
  ev("atribuicao", 24, "ASSUMIDA", {
    handoff_event_id: "handoff",
    metodo: "distribuicao_automatica",
    para_user_id: "atendente",
  }),
];
const grupo = (avisoId: string | null = "aviso"): Item => ({
  id: "grupo",
  em: base + 12000,
  grupo: agruparTimeline({ eventos: eventos(avisoId) }).itens[0],
});
const ordenar = (itens: Item[]) => posicionarHandoffAposAviso(itens, (i) => i);
const ids = (itens: Item[]) => ordenar(itens).map((i) => i.id);

describe("aviso ao paciente antes dos detalhes internos da transferência", () => {
  it("caso da imagem: paciente, aviso enviado, card único de encaminhamento e atribuição", () => {
    const itens = [
      msg("paciente", 7, "in", "received"),
      grupo(),
      msg("aviso", 15.7),
      msg("resposta", 26, "in", "received"),
    ];
    const original = structuredClone(itens);
    expect(ids(itens)).toEqual(["paciente", "aviso", "grupo", "resposta"]);
    expect((itens[1].grupo as GrupoHandoff).atribuicao?.atendenteUserId).toBe("atendente");
    expect(itens).toEqual(original);
    const ordenados = ordenar(itens);
    expect(ordenados[2]).toBe(itens[1]);
    expect(ids(ordenados)).toEqual(ordenados.map((i) => i.id));
  });

  it("preserva reabertura e atribuição à Nina antes da mensagem do paciente", () => {
    const itens: Item[] = [
      { id: "fechou", em: base - 10000, evento: ev("fechou", -10, "FINALIZADA") },
      msg("paciente", 7, "in", "received"),
      {
        id: "reabriu",
        em: base + 8000,
        evento: ev("reabriu", 8, "REABERTA", { mensagem_origem_id: "paciente" }),
      },
      {
        id: "nina",
        em: base + 9000,
        evento: ev("nina", 9, "ATRIBUIDA_IA", {
          reabertura_evento_id: "reabriu",
          mensagem_origem_id: "paciente",
        }),
      },
      grupo(),
      msg("aviso", 15.7),
    ];
    const reabertura = anteciparReabertura(itens, (i) => ({
      em: i.em,
      evento: i.evento,
      mensagem: i.mensagem ? { ...i.mensagem, sistema: i.mensagem.status === "system" } : undefined,
    }));
    expect(ids(reabertura)).toEqual(["fechou", "reabriu", "nina", "paciente", "aviso", "grupo"]);
  });

  it("homologação: move os eventos internos anteriores, preservando os posteriores", () => {
    const itens: Item[] = [
      msg("paciente", 7, "in", "received"),
      ...eventos().map((e) => ({ id: e.id, em: Date.parse(e.created_at), evento: e })),
      msg("aviso", 15.7),
    ].sort((a, b) => a.em - b.em);
    expect(ids(itens)).toEqual([
      "paciente",
      "aviso",
      "handoff",
      "fila",
      "protocolo",
      "informado",
      "atribuicao",
    ]);
  });

  it("vínculo explícito prevalece sobre texto, protocolo e timestamp empatado", () => {
    const aviso = msg("aviso", 12);
    aviso.mensagem!.body = "A equipe continuará o atendimento por aqui.";
    expect(ids([grupo(), aviso])).toEqual(["aviso", "grupo"]);
  });

  it("usa auditoria de envio quando o evento de protocolo informado não está na página", () => {
    const audit = ev("auditoria", 17, "HANDOFF_AUDITORIA", {
      handoff_event_id: "handoff",
      protocol_number: "MJ-112",
      message_id: "aviso",
      send_status: "sent",
    });
    const g = agruparTimeline({ eventos: [eventos()[0], audit] }).itens[0];
    expect(ids([{ id: "grupo", em: base + 12000, grupo: g }, msg("aviso", 15)])).toEqual([
      "aviso",
      "grupo",
    ]);
  });

  it("legado só usa protocolo correspondente com um aviso único na janela", () => {
    expect(ids([grupo(null), msg("aviso", 15)])).toEqual(["aviso", "grupo"]);
    const outro = msg("outro", 15);
    outro.mensagem!.body = "Protocolo MJ-113";
    expect(ids([grupo(null), outro])).toEqual(["grupo", "outro"]);
    expect(ids([grupo(null), msg("aviso", 200)])).toEqual(["grupo", "aviso"]);
    expect(ids([grupo(null), msg("aviso", 15), msg("duplicado", 16)])).toEqual([
      "grupo",
      "aviso",
      "duplicado",
    ]);
  });

  it("paginação: espera o aviso vinculado, sem buscar mais dados nem usar outro aviso", () => {
    expect(ids([grupo()])).toEqual(["grupo"]);
    expect(ids([grupo(), msg("outro-aviso", 15)])).toEqual(["grupo", "outro-aviso"]);
    expect(ids([msg("aviso", 15)])).toEqual(["aviso"]);
    expect(ids([grupo(), msg("aviso", 15)])).toEqual(["aviso", "grupo"]);
  });

  it("transferência silenciosa, mensagem interna, pendente ou com falha conserva o registro", () => {
    expect(
      ids([
        {
          id: "silencioso",
          em: base + 12000,
          grupo: agruparTimeline({ eventos: [eventos()[0]] }).itens[0],
        },
      ]),
    ).toEqual(["silencioso"]);
    for (const status of ["system", "pending", "failed"]) {
      expect(ids([grupo(), msg("aviso", 15, "out", status)])).toEqual(["grupo", "aviso"]);
    }
    expect(ids([grupo(), msg("aviso", 15, "in", "sent")])).toEqual(["grupo", "aviso"]);
  });

  it("não atravessa fechamento, reabertura ou outro encaminhamento", () => {
    for (const evento of [
      "FINALIZADA",
      "REABERTA",
      "HANDOFF_SOLICITADO",
      "DEVOLVIDA_PARA_IA",
      "TRANSFERIDA",
    ]) {
      const barreira: Item = {
        id: "barreira",
        em: base + 13000,
        evento: ev("barreira", 13, evento),
      };
      expect(ids([grupo(), barreira, msg("aviso", 15)])).toEqual(["grupo", "barreira", "aviso"]);
    }
    const outro = { ...grupo(), id: "outro", grupo: { ...grupo().grupo!, chave: "outro" } } as Item;
    expect(ids([grupo(), outro, msg("aviso", 15)])[0]).toBe("grupo");
  });

  it("não reordena avisos/mensagens entre si nem registros que já vêm depois", () => {
    const itens = [
      grupo(),
      msg("intercalada", 14, "in", "received"),
      msg("aviso", 15),
      msg("resposta", 16),
    ];
    expect(
      ordenar(itens)
        .filter((i) => i.mensagem)
        .map((i) => i.id),
    ).toEqual(["intercalada", "aviso", "resposta"]);
    expect(ids([msg("aviso", 15), grupo()])).toEqual(["aviso", "grupo"]);
  });
});
