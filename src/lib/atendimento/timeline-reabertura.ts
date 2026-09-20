/** Ordem de apresentação; datas, mensagens e eventos originais não são alterados. */
export interface RegistroReabertura {
  em: number;
  mensagem?: { id: string; direction: string; sistema: boolean };
  evento?: { id: string; evento: string; motivo?: string | null; detalhes?: unknown };
}

const JANELA_LEGADO_MS = 120_000;

function detalhe(registro: RegistroReabertura, campo: string): string | null {
  const dados = registro.evento?.detalhes;
  if (!dados || typeof dados !== "object") return null;
  const valor = (dados as Record<string, unknown>)[campo];
  return typeof valor === "string" && valor.trim() ? valor : null;
}

const entradaPaciente = (r: RegistroReabertura) =>
  r.mensagem?.direction === "in" && !r.mensagem.sistema;

/**
 * Insere os avisos do novo atendimento antes da mensagem que o abriu.
 * Recebe a timeline já ordenada e mantém a ordem relativa de todas as mensagens.
 * Se a mensagem ainda não foi carregada, aguarda a próxima página/atualização.
 */
export function anteciparReabertura<T>(itens: T[], ler: (item: T) => RegistroReabertura): T[] {
  const registros = itens.map(ler);
  const mensagens = new Map(
    registros.flatMap((r, i) => (r.mensagem ? [[r.mensagem.id, i] as const] : [])),
  );
  const antes = new Map<number, number[]>();
  const movidos = new Set<number>();

  for (let i = 0; i < registros.length; i++) {
    const reabertura = registros[i];
    if (reabertura.evento?.evento !== "REABERTA") continue;
    const origem = detalhe(reabertura, "mensagem_origem_id");
    let alvo = origem ? mensagens.get(origem) : undefined;
    if (!origem) {
      // Legado: somente a sequência imediata de entradas que precedeu o aviso.
      // Uma resposta, encerramento ou outro evento delimita o atendimento.
      for (let j = i - 1; j >= 0; j--) {
        const r = registros[j];
        const distancia = reabertura.em - r.em;
        if (!entradaPaciente(r) || distancia < 0 || distancia > JANELA_LEGADO_MS) break;
        alvo = j;
      }
    }
    if (alvo === undefined || !entradaPaciente(registros[alvo])) continue;
    // Mesmo com vínculo explícito, não atravessa o encerramento de outro ciclo.
    if (
      registros
        .slice(Math.min(alvo, i) + 1, Math.max(alvo, i))
        .some((r) =>
          ["FINALIZADA", "REABERTA", "IA_MEMORIA_RESETADA", "ATENDIMENTO_ENCERRADO"].includes(
            r.evento?.evento ?? "",
          ),
        )
    )
      continue;

    const grupo = [i];
    // O vínculo novo permite identificar a atribuição mesmo com timestamps empatados.
    const atribuicaoExplicita = registros.findIndex(
      (r) =>
        r.evento?.evento === "ATRIBUIDA_IA" &&
        detalhe(r, "reabertura_evento_id") === reabertura.evento!.id &&
        (!detalhe(r, "mensagem_origem_id") || detalhe(r, "mensagem_origem_id") === origem),
    );
    if (atribuicaoExplicita >= 0) grupo.push(atribuicaoExplicita);
    else {
      for (let j = i + 1; j < registros.length; j++) {
        const r = registros[j];
        if (r.mensagem) continue;
        if (
          r.evento?.evento === "ATRIBUIDA_IA" &&
          !detalhe(r, "reabertura_evento_id") &&
          !detalhe(r, "mensagem_origem_id") &&
          /^Reabertura:/i.test(r.evento.motivo ?? "") &&
          r.em >= reabertura.em &&
          r.em - reabertura.em <= JANELA_LEGADO_MS
        )
          grupo.push(j);
        break;
      }
    }
    antes.set(alvo, [...(antes.get(alvo) ?? []), ...grupo]);
    grupo.forEach((j) => movidos.add(j));
  }

  return itens.flatMap((item, i) => [
    ...(antes.get(i) ?? []).map((j) => itens[j]),
    ...(movidos.has(i) ? [] : [item]),
  ]);
}
