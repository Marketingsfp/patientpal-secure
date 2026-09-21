import type { RegistroOrdemHandoff } from "./timeline-handoff";

const JANELA_CONCLUSAO_MS = 5 * 60_000;

/**
 * O protocolo da reserva é registrado antes de enviar a conclusão. Exibe seu
 * encerramento depois da resposta da Nina, preservando os registros e datas.
 * A mesma regra atende eventos individuais e agrupados, inclusive históricos.
 */
export function posicionarEncerramentoAposConclusao<T>(
  itens: T[], ler: (item: T) => RegistroOrdemHandoff,
): T[] {
  const registros = itens.map(ler);
  const evento = (r: RegistroOrdemHandoff) => r.evento ??
    (r.grupo?.tipo === "EVENTO" ? r.grupo.evento : null);
  const depois = new Map<number, number[]>();
  const movidos = new Set<number>();
  for (let i = 0; i < registros.length; i++) {
    const fechamento = evento(registros[i]!);
    if (fechamento?.evento !== "ATENDIMENTO_ENCERRADO") continue;
    const detalhes = fechamento.detalhes as Record<string, unknown> | null;
    const mensagemId = detalhes?.mensagem_conclusao_id;
    for (let j = i + 1; j < registros.length; j++) {
      const r = registros[j]!;
      const e = evento(r);
      // Nunca atravessa outra mensagem do paciente, outro ciclo ou handoff.
      if (r.mensagem?.direction === "in" || r.grupo?.tipo === "HANDOFF" ||
        (e && ["FINALIZADA", "REABERTA", "IA_MEMORIA_RESETADA", "ATENDIMENTO_ENCERRADO",
          "HANDOFF_SOLICITADO", "TRANSFERIDA", "ATRIBUIDA_IA"].includes(e.evento))) break;
      if (r.em - registros[i]!.em > JANELA_CONCLUSAO_MS) break;
      const m = r.mensagem;
      if (!m || m.direction !== "out" || m.enviada_por !== "nina" ||
        !["sent", "delivered", "read"].includes(m.status ?? "")) continue;
      const texto = (m.body ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      // Legado: exige a conclusão positiva da reserva, não qualquer saída.
      const conclusao = mensagemId ? m.id === mensagemId
        : /\b(?:seu\s+)?(?:pre[- ]?)?agendamento\s+(?:foi\s+realizado|(?:esta|foi)\s+confirmado)\b/i.test(texto);
      if (!conclusao) continue;
      depois.set(j, [...(depois.get(j) ?? []), i]);
      movidos.add(i);
      break;
    }
  }
  return itens.flatMap((item, i) => [
    ...(movidos.has(i) ? [] : [item]),
    ...(depois.get(i) ?? []).map(j => itens[j]!),
  ]);
}
