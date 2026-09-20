import {
  agruparTimeline,
  JANELA_HANDOFF_MS,
  protocoloDoTexto,
  type EventoTimeline,
  type GrupoHandoff,
  type ItemTimelineAgrupado,
} from "./timeline-grupos";

export interface RegistroOrdemHandoff {
  em: number;
  mensagem?: {
    id: string;
    direction: string;
    body?: string | null;
    enviada_por?: string | null;
    status?: string | null;
  };
  grupo?: ItemTimelineAgrupado;
  evento?: Omit<EventoTimeline, "detalhes"> & { detalhes?: unknown };
}

/**
 * Mostra o aviso ao paciente antes dos detalhes internos do mesmo handoff.
 * Só move registros internos já carregados, sem mudar datas ou a ordem das
 * mensagens. Serve tanto ao card agrupado real quanto aos eventos da homologação.
 */
export function posicionarHandoffAposAviso<T>(
  itens: T[],
  ler: (item: T) => RegistroOrdemHandoff,
): T[] {
  const registros = itens.map(ler);
  const eventos = registros.flatMap((r) =>
    r.evento
      ? [
          {
            ...r.evento,
            detalhes: r.evento.detalhes as Record<string, unknown> | null,
          },
        ]
      : [],
  );
  const grupos = [
    ...registros.flatMap((r) => (r.grupo?.tipo === "HANDOFF" ? [r.grupo] : [])),
    ...agruparTimeline({ eventos }).itens.filter((g): g is GrupoHandoff => g.tipo === "HANDOFF"),
  ];
  const depois = new Map<number, number[]>();
  const movidos = new Set<number>();
  const mensagemEnviada = (r: RegistroOrdemHandoff) =>
    r.mensagem?.direction === "out" &&
    ["sent", "delivered", "read"].includes(r.mensagem.status ?? "");

  for (const grupo of grupos) {
    const ids = new Set(grupo.eventoIds);
    const indices = registros.flatMap((r, i) =>
      r.grupo?.chave === grupo.chave || (r.evento && ids.has(r.evento.id)) ? [i] : [],
    );
    const candidatos = registros.flatMap((r, i) => {
      if (!mensagemEnviada(r)) return [];
      // Vínculo explícito ausente na página: aguarda lazy loading, sem adivinhar.
      if (grupo.mensagemAvisoId) return r.mensagem!.id === grupo.mensagemAvisoId ? [i] : [];
      const distancia = r.em - Date.parse(grupo.criadoEm);
      return grupo.protocolo &&
        ["nina", "sistema"].includes(r.mensagem!.enviada_por ?? "") &&
        protocoloDoTexto(r.mensagem!.body) === grupo.protocolo &&
        distancia >= 0 &&
        distancia <= JANELA_HANDOFF_MS
        ? [i]
        : [];
    });
    if (candidatos.length !== 1) continue;
    const alvo = candidatos[0];
    const antecipados = indices.filter((i) => i < alvo);
    if (!antecipados.length) continue;
    // Não atravessa outro ciclo/transferência, mesmo diante de vínculo inconsistente.
    const separou = registros.slice(antecipados[0] + 1, alvo).some((r) => {
      if (r.grupo?.tipo === "HANDOFF") return r.grupo.chave !== grupo.chave;
      if (r.grupo?.tipo === "ATRIBUICAO" && r.grupo.transferencia) return true;
      const evento = r.evento ?? (r.grupo?.tipo === "EVENTO" ? r.grupo.evento : null);
      return (
        evento &&
        !ids.has(evento.id) &&
        [
          "HANDOFF_SOLICITADO",
          "FINALIZADA",
          "REABERTA",
          "ATRIBUIDA_IA",
          "DEVOLVIDA_PARA_IA",
          "IA_MEMORIA_RESETADA",
          "ATENDIMENTO_ENCERRADO",
          "TRANSFERIDA",
        ].includes(evento.evento)
      );
    });
    if (separou) continue;
    depois.set(alvo, [...(depois.get(alvo) ?? []), ...antecipados]);
    antecipados.forEach((i) => movidos.add(i));
  }
  return itens.flatMap((item, i) => [
    ...(movidos.has(i) ? [] : [item]),
    ...(depois.get(i) ?? []).map((j) => itens[j]),
  ]);
}
