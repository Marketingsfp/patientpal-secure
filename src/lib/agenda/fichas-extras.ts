// Fichas A MAIS num dia que já tem agenda gerada (agenda de hora marcada).
//
// Pedido da clínica (2026-10-06): mais fichas por turno SEM mudar início, fim
// nem intervalo da escala. As fichas a mais entram no último horário do turno,
// 1 segundo uma depois da outra, logo depois da última ficha DENTRO do turno.
//
// Por que assim:
// - a ficha é POSICIONAL (ver `numerarFichas` em ficha-numero.ts), então tudo
//   que entra depois da última ficha do turno não muda o número de nenhuma
//   ficha anterior — as extras continuam a sequência (025, 026…);
// - o segundo de diferença evita o unique index de vaga vazia e impede que a
//   numeração as trate como encaixe (mesmo instante = mesmo número);
// - nada passa do fim do turno.
//
// Encaixe lançado DEPOIS do fim do turno (ex.: 16:30 de quem termina às
// 16:00) vai para o fim da sequência — só não pode quando esse paciente já
// passou pela recepção, porque a ficha dele pode estar impressa.

export type LinhaExistente = {
  /** Instante do `inicio` da linha (ms). */
  ms: number;
  /** Paciente já passou pela recepção (check-in, atendimento): número travado. */
  travada: boolean;
};

export type FichasExtrasInput = {
  /** "YYYY-MM-DD" (dia civil local). */
  diaIso: string;
  /** "HH:MM" — fim do turno do médico no dia. */
  fimTurno: string;
  /** TODAS as linhas do dia nessa agenda (inclusive canceladas). */
  linhas: readonly LinhaExistente[];
  quantidade: number;
};

export type FichasExtrasResultado =
  | { ok: true; fichas: Array<{ inicio: Date; fim: Date }>; naoCouberam: number }
  | { ok: false; motivo: "dia_sem_fichas" | "paciente_na_recepcao" | "sem_espaco" };

const MS_SEG = 1000;

/** Quantas fichas (números distintos) o dia já tem. */
export function fichasExistentes(linhas: readonly LinhaExistente[]): number {
  return new Set(linhas.map((l) => l.ms)).size;
}

export function posicoesFichasExtras(input: FichasExtrasInput): FichasExtrasResultado {
  const n = Math.floor(input.quantidade);
  const fimMs = new Date(`${input.diaIso}T${input.fimTurno.slice(0, 5)}:00`).getTime();
  const dentro = input.linhas.filter((l) => l.ms < fimMs);
  if (!Number.isFinite(n) || n < 1 || dentro.length === 0) {
    return { ok: false, motivo: "dia_sem_fichas" };
  }
  const base = Math.max(...dentro.map((l) => l.ms));
  if (input.linhas.some((l) => l.ms > base && l.travada)) {
    return { ok: false, motivo: "paciente_na_recepcao" };
  }
  const fichas: Array<{ inicio: Date; fim: Date }> = [];
  for (let k = 1; k <= n; k++) {
    const ini = base + k * MS_SEG;
    if (ini >= fimMs) break;
    fichas.push({ inicio: new Date(ini), fim: new Date(fimMs) });
  }
  if (fichas.length === 0) return { ok: false, motivo: "sem_espaco" };
  return { ok: true, fichas, naoCouberam: n - fichas.length };
}

/** Linha de `agendamentos` como as duas telas leem para montar as extras. */
export type LinhaDoDia = {
  agenda_id: string | null;
  inicio: string;
  status: string | null;
  fluxo_etapa: string | null;
};

/** O paciente já passou pela recepção — a ficha dele pode estar impressa. */
export const linhaTravada = (r: Pick<LinhaDoDia, "status" | "fluxo_etapa">) =>
  r.status === "realizado" || (!!r.fluxo_etapa && r.fluxo_etapa !== "aguardando_recepcao");

export type AlvoFichasExtras = {
  diaIso: string;
  agendaId: string;
  /** "HH:MM" — fim do turno da grade vigente nesse dia. */
  fimTurno: string;
};

/**
 * Monta as fichas a mais de vários dias/agendas de um médico ("Adicionar mais
 * fichas" em Horários médicos e "+ Mais fichas" na Agenda). `diaLocal`
 * converte o `inicio` gravado no dia civil da clínica.
 */
export function montarFichasExtras(input: {
  alvos: readonly AlvoFichasExtras[];
  existentes: readonly LinhaDoDia[];
  quantidade: number;
  diaLocal: (iso: string) => string;
}) {
  const porDia = new Map<string, LinhaExistente[]>();
  for (const r of input.existentes) {
    const key = `${r.agenda_id ?? ""}|${input.diaLocal(r.inicio)}`;
    const arr = porDia.get(key) ?? [];
    arr.push({ ms: new Date(r.inicio).getTime(), travada: linhaTravada(r) });
    porDia.set(key, arr);
  }
  const fichas: Array<{ agendaId: string; diaIso: string; inicio: Date; fim: Date }> = [];
  const semAgenda = new Set<string>();
  const naRecepcao = new Set<string>();
  let naoCouberam = 0;
  for (const a of input.alvos) {
    const r = posicoesFichasExtras({
      diaIso: a.diaIso,
      fimTurno: a.fimTurno,
      linhas: porDia.get(`${a.agendaId}|${a.diaIso}`) ?? [],
      quantidade: input.quantidade,
    });
    if (!r.ok) {
      if (r.motivo === "paciente_na_recepcao") naRecepcao.add(a.diaIso);
      else if (r.motivo === "dia_sem_fichas") semAgenda.add(a.diaIso);
      else naoCouberam += input.quantidade;
      continue;
    }
    naoCouberam += r.naoCouberam;
    for (const f of r.fichas) fichas.push({ agendaId: a.agendaId, diaIso: a.diaIso, ...f });
  }
  return { fichas, semAgenda: [...semAgenda], naRecepcao: [...naRecepcao], naoCouberam };
}

/** Avisos dos dias que ficaram de fora, em português para a tela. */
export function avisosFichasExtras(
  r: Pick<ReturnType<typeof montarFichasExtras>, "semAgenda" | "naRecepcao" | "naoCouberam">,
  dataBR: (iso: string) => string,
): string[] {
  return [
    r.semAgenda.length > 0
      ? `Sem agenda gerada nesse dia (gere os horários primeiro): ${r.semAgenda.map(dataBR).join(", ")}.`
      : "",
    r.naRecepcao.length > 0
      ? `Não mexido — tem paciente marcado depois do fim do turno que já passou pela recepção: ${r.naRecepcao.map(dataBR).join(", ")}.`
      : "",
    r.naoCouberam > 0 ? `${r.naoCouberam} ficha(s) não couberam antes do fim do turno.` : "",
  ].filter(Boolean);
}
