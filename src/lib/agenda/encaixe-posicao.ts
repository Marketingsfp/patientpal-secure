// Onde entra um ENCAIXE numa agenda de HORA MARCADA — fonte única da regra.
//
// Encaixe é a linha NOVA que a recepção lança quando não há vaga livre no
// horário pedido (ver `criar-agendamento.core.server.ts`). Para não estragar a
// agenda ele precisa de duas coisas:
//
//   1. uma AGENDA. A ficha é posicional por (dia, médico, agenda) — ver
//      `ficha-numero.ts`. Linha sem agenda some da tela quando a recepção filtra
//      por agenda e forma uma fila própria que imprime "001". Foi o que
//      aconteceu em 10/09/2026 com o Dr. João Hélio, que tem duas agendas no
//      mesmo dia (CONSULTAS e EXAMES): encaixes das 17:00/17:15, depois do fim
//      da grade, e das 09:00, antes do início, foram gravados sem agenda,
//      sumiram da lista e a recepção relançou achando que não tinham sido
//      criados.
//
//   2. uma POSIÇÃO que não renumere fichas já entregues. Só existem duas
//      posições seguras: exatamente o horário de uma ficha existente (as duas
//      dividem o número) ou depois da última ficha da agenda naquele dia
//      (número novo no fim da fila). Qualquer horário no meio — antes do
//      início da grade, no vão do almoço, entre dois encaixes do fim do dia —
//      empurraria em +1 o número de todo mundo que vem depois.
//
// Agendas de ORDEM DE CHEGADA não passam por aqui: lá o encaixe já entra no fim
// da fila pela própria tela (`proximaPosicaoDaFila`).

export type LinhaDoDia = {
  inicio: string;
  fim: string;
  agenda_id: string | null;
  paciente_nome?: string | null;
};

export type AgendaDoMedico = {
  id: string;
  nome?: string | null;
  ativo?: boolean | null;
  /** Tipos de procedimento liberados na agenda (consulta/exame/procedimento). */
  tipos: string[];
};

export type PosicaoEncaixe =
  | {
      ok: true;
      agendaId: string | null;
      agendaNome: string | null;
      /** Horário a gravar — pode diferir do pedido quando cai dentro de uma ficha. */
      inicio: string;
      fim: string;
      /** `sobre_ficha`: divide o número com a ficha existente; `fim_da_fila`: número novo no fim. */
      modo: "sobre_ficha" | "fim_da_fila";
      /** Paciente da ficha sobreposta (só em `sobre_ficha`). */
      ocupante: string | null;
      /** Fim da última ficha da agenda no dia (só em `fim_da_fila`). */
      fimDaAgenda: string | null;
    }
  | { ok: false; erro: string };

/**
 * Mesma regra da checagem "tipo da agenda × tipo do procedimento" do núcleo
 * (4b): agenda só de consultas não recebe exame, agenda só de exames não
 * recebe consulta, agenda mista ou sem vínculo aceita tudo.
 */
export function agendaAceitaTipos(tiposAgenda: readonly string[], tiposPedidos: readonly string[]) {
  const set = new Set(tiposAgenda.filter(Boolean));
  if (set.size === 0) return true;
  const soConsulta = set.size === 1 && set.has("consulta");
  const soExame = Array.from(set).every((t) => t === "exame" || t === "procedimento");
  if (soConsulta) return tiposPedidos.every((t) => t === "consulta");
  if (soExame) return tiposPedidos.every((t) => t !== "consulta");
  return true;
}

export function posicionarEncaixe(args: {
  inicio: string;
  fim: string;
  /** Linhas do médico no dia da clínica (vagas, fichas, canceladas), sem a linha em edição. */
  linhasDoDia: readonly LinhaDoDia[];
  agendasDoMedico: readonly AgendaDoMedico[];
  /** Agenda que a recepção está olhando na tela (filtro "Agenda"), se houver. */
  agendaPreferidaId: string | null | undefined;
  /** Tipo de cada procedimento pedido (sem nulos). */
  tiposDosProcedimentos: readonly string[];
  formatarHora: (iso: string) => string;
}): PosicaoEncaixe {
  const { linhasDoDia, agendasDoMedico, formatarHora } = args;
  const ms = (iso: string) => new Date(iso).getTime();
  const inicioMs = ms(args.inicio);
  const cobre = (l: LinhaDoDia) => ms(l.inicio) <= inicioMs && ms(l.fim) > inicioMs;

  const idsDoDia = Array.from(
    new Set(linhasDoDia.map((l) => l.agenda_id).filter((x): x is string => !!x)),
  );
  const nomeDe = (id: string | null) =>
    (id ? agendasDoMedico.find((a) => a.id === id)?.nome : null)?.trim() || null;

  // ---------- 1. Qual agenda ----------
  // Primeiro a que a recepção está olhando: é nela que ela vai procurar o
  // encaixe depois de salvar. Só vale se for mesmo deste médico.
  const preferida =
    args.agendaPreferidaId &&
    (agendasDoMedico.some((a) => a.id === args.agendaPreferidaId && a.ativo !== false) ||
      idsDoDia.includes(args.agendaPreferidaId))
      ? args.agendaPreferidaId
      : null;
  let agendaId: string | null =
    preferida ?? linhasDoDia.find(cobre)?.agenda_id ?? (idsDoDia.length === 1 ? idsDoDia[0] : null);
  if (!agendaId && idsDoDia.length > 1) {
    const compativeis = idsDoDia.filter((id) =>
      agendaAceitaTipos(
        agendasDoMedico.find((a) => a.id === id)?.tipos ?? [],
        args.tiposDosProcedimentos,
      ),
    );
    if (compativeis.length === 1) agendaId = compativeis[0];
  }
  if (!agendaId && idsDoDia.length > 1) {
    const nomes = idsDoDia.map((id) => nomeDe(id) ?? "sem nome").join(", ");
    return {
      ok: false,
      erro:
        `Este médico tem mais de uma agenda neste dia (${nomes}).\n\n` +
        `Escolha a agenda no filtro "Agenda", no topo da tela, e lance o encaixe de novo — ` +
        `assim ele entra na fila certa e aparece na lista.`,
    };
  }

  // ---------- 2. Em que posição da fila ----------
  const daFila = linhasDoDia.filter((l) => (l.agenda_id ?? null) === agendaId);
  const agendaNome = nomeDe(agendaId);
  const sobreposta = daFila.find(cobre) ?? null;
  if (sobreposta) {
    // Dentro de uma ficha: grava no horário EXATO dela, que é o que faz as
    // duas dividirem o número (ficha-numero.ts compara o instante de início).
    return {
      ok: true,
      agendaId,
      agendaNome,
      inicio: sobreposta.inicio,
      fim: sobreposta.fim,
      modo: "sobre_ficha",
      ocupante: sobreposta.paciente_nome ?? null,
      fimDaAgenda: null,
    };
  }
  const ultimoInicio = daFila.reduce((m, l) => Math.max(m, ms(l.inicio)), -Infinity);
  const fimDaAgenda = daFila.reduce<string | null>(
    (m, l) => (m === null || ms(l.fim) > ms(m) ? l.fim : m),
    null,
  );
  if (daFila.length === 0 || inicioMs > ultimoInicio) {
    return {
      ok: true,
      agendaId,
      agendaNome,
      inicio: args.inicio,
      fim: args.fim,
      modo: "fim_da_fila",
      ocupante: null,
      fimDaAgenda,
    };
  }

  // No meio da fila, fora de qualquer ficha: recusado, com o caminho certo.
  const primeiroInicio = daFila.reduce((m, l) => Math.min(m, ms(l.inicio)), Infinity);
  const rotulo = agendaNome ? `A agenda ${agendaNome}` : "A agenda deste médico";
  const hora = formatarHora(args.inicio);
  const saida =
    `Para encaixar, use o horário de uma ficha que já existe (o encaixe divide a ficha com ela) ` +
    `ou um horário a partir das ${formatarHora(fimDaAgenda!)}, depois da última ficha do dia.`;
  if (inicioMs < primeiroInicio) {
    return {
      ok: false,
      erro:
        `${rotulo} começa às ${formatarHora(new Date(primeiroInicio).toISOString())}. ` +
        `Um encaixe às ${hora} entraria antes da primeira ficha e mudaria o número de todas as fichas do dia, ` +
        `inclusive as que já foram entregues.\n\n${saida}`,
    };
  }
  return {
    ok: false,
    erro:
      `Às ${hora} não há ficha nesta agenda (é um intervalo entre fichas). ` +
      `Um encaixe aqui mudaria o número das fichas seguintes, inclusive as que já foram entregues.\n\n${saida}`,
  };
}
