// Bloqueio de agenda — "o médico não atende neste horário".
//
// É uma ficha da grade sem paciente, com `paciente_nome = "BLOQUEIO"` e o
// motivo em `observacoes` ("Bloqueado: CONGRESSO"). O formato é o mesmo que a
// tela Horários médicos já gravava, para os dois caminhos conviverem.
//
// Até 10/10/2026 a Agenda tratava o bloqueio como horário LIVRE: mostrava
// "DISPONÍVEL" e deixava marcar paciente em cima. Por isso a recepção da
// Menino Jesus passou a marcar um paciente fictício "NAO MARCAR" (27 fichas
// entre 11/09 e 12/10/2026), que pintava a linha de verde como confirmado.
// Agora o bloqueio aparece como faixa própria e ninguém marca por cima —
// recepção, Nina, API ou site. Para marcar, desfaz-se o bloqueio antes.

export const NOME_BLOQUEIO = "BLOQUEIO";
const PREFIXO_MOTIVO = "Bloqueado:";
const SEM_MOTIVO_LEGADO = "bloqueado pela recepcao";

const normalizar = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Ficha de bloqueio da grade (sem paciente vinculado). */
export const ehBloqueioAgenda = (a: {
  paciente_nome?: string | null;
  paciente_id?: string | null;
}) => !a.paciente_id && normalizar(a.paciente_nome) === "bloqueio";

/** Texto gravado em `observacoes`. O motivo é obrigatório na Agenda. */
export const observacaoDoBloqueio = (motivo: string) => `${PREFIXO_MOTIVO} ${motivo.trim()}`;

/** Motivo legível a partir de `observacoes` ("" quando não há). */
export function motivoDoBloqueio(observacoes: string | null | undefined): string {
  const t = (observacoes ?? "").trim();
  if (!t || normalizar(t) === SEM_MOTIVO_LEGADO) return "";
  return t.toLowerCase().startsWith(PREFIXO_MOTIVO.toLowerCase())
    ? t.slice(PREFIXO_MOTIVO.length).trim()
    : t;
}

type LinhaGrade = {
  id: string;
  paciente_nome: string | null;
  paciente_id?: string | null;
  status?: string | null;
  inicio: string;
  fim: string;
  observacoes?: string | null;
};

/**
 * Primeira ficha de bloqueio que cruza o intervalo [inicio, fim) — ou null.
 * Ficha cancelada não conta.
 */
export function bloqueioNoIntervalo<T extends LinhaGrade>(
  linhas: T[],
  inicio: string,
  fim: string,
): T | null {
  const ini = new Date(inicio).getTime();
  const fi = new Date(fim).getTime();
  return (
    linhas.find(
      (l) =>
        ehBloqueioAgenda(l) &&
        l.status !== "cancelado" &&
        new Date(l.inicio).getTime() < fi &&
        new Date(l.fim).getTime() > ini,
    ) ?? null
  );
}

/**
 * Dia inteiro bloqueado: há fichas no dia e todas as que não foram canceladas
 * são de bloqueio. Pega o encaixe fora da grade (ex.: ordem de chegada) num dia
 * em que o médico avisou que não vem.
 */
export function diaTodoBloqueado(linhas: LinhaGrade[]): boolean {
  const vivas = linhas.filter((l) => l.status !== "cancelado");
  return vivas.length > 0 && vivas.every((l) => ehBloqueioAgenda(l));
}

/** Mensagem de recusa ao tentar marcar sobre um bloqueio. */
export function mensagemHorarioBloqueado(linha: { observacoes?: string | null }): string {
  const motivo = motivoDoBloqueio(linha.observacoes);
  return (
    `O médico não atende neste horário${motivo ? ` (motivo: ${motivo})` : ""}. ` +
    `Para marcar mesmo assim, desfaça o bloqueio na Agenda antes.`
  );
}

export type FaixaBloqueio = {
  /** Ficha onde a faixa é desenhada (a primeira do trecho). */
  cabecaId: string;
  ids: string[];
  inicio: string;
  fim: string;
  motivo: string;
  medicoId: string | null;
};

/**
 * Junta fichas de bloqueio seguidas do mesmo médico/agenda/dia e mesmo motivo
 * num trecho só — a Agenda mostra UMA faixa "08:00–12:00 MÉDICO AUSENTE" em
 * vez de uma linha por ficha. Trechos separados por um vão (almoço) viram duas
 * faixas. Devolve o trecho de cada id de bloqueio.
 */
export function faixasDeBloqueio(
  linhas: Array<
    LinhaGrade & { medico_id?: string | null; agenda_id?: string | null; diaIso: string }
  >,
): Map<string, FaixaBloqueio> {
  const grupos = new Map<string, typeof linhas>();
  for (const l of linhas) {
    if (!ehBloqueioAgenda(l) || l.status === "cancelado") continue;
    const chave = `${l.medico_id ?? ""}|${l.agenda_id ?? ""}|${l.diaIso}|${normalizar(motivoDoBloqueio(l.observacoes))}`;
    const g = grupos.get(chave) ?? [];
    g.push(l);
    grupos.set(chave, g);
  }
  const out = new Map<string, FaixaBloqueio>();
  for (const g of grupos.values()) {
    g.sort((a, b) => a.inicio.localeCompare(b.inicio));
    let atual: FaixaBloqueio | null = null;
    let fimMs = 0;
    for (const l of g) {
      const iniMs = new Date(l.inicio).getTime();
      if (!atual || iniMs > fimMs) {
        atual = {
          cabecaId: l.id,
          ids: [],
          inicio: l.inicio,
          fim: l.fim,
          motivo: motivoDoBloqueio(l.observacoes),
          medicoId: l.medico_id ?? null,
        };
        fimMs = 0;
      }
      atual.ids.push(l.id);
      const lFim = new Date(l.fim).getTime();
      if (lFim > fimMs) {
        fimMs = lFim;
        atual.fim = l.fim;
      }
      out.set(l.id, atual);
    }
  }
  return out;
}
