/**
 * Intervalos (almoço) dentro do dia de um médico numa agenda.
 *
 * A grade de um dia pode parar no meio — porque foi cadastrada em duas faixas
 * (manhã e tarde) ou porque as fichas do dia foram geradas com esse pulo. Até
 * aqui isso só existia como ausência de linha: a lista da Agenda saltava de
 * 12:00 para 13:20 sem dizer por quê, e quem estava no balcão marcando não
 * tinha como explicar ao paciente o que havia ali.
 *
 * O vão é sempre calculado sobre TODAS as fichas carregadas do dia, nunca
 * sobre a lista já filtrada: esconder os horários livres, buscar um paciente
 * ou filtrar por situação também abrem buracos, e nenhum deles é intervalo.
 */

export type FaixaGrade = {
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
};

export type VaoDaGrade = {
  /** "HH:MM" em que o médico para. */
  inicio: string;
  /** "HH:MM" em que ele volta. */
  fim: string;
  minutos: number;
};

const hhmm = (v: string) => v.slice(0, 5);

const emMinutos = (v: string) => {
  const [h, m] = hhmm(v).split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
};

/**
 * Buracos entre pedaços de tempo de um mesmo dia. `minMinutos` evita
 * transformar em "intervalo" a folga de poucos minutos entre duas fichas.
 */
export function vaosEntreHorarios(
  pedacos: Array<{ inicio: string; fim: string }>,
  minMinutos = 30,
): VaoDaGrade[] {
  const doDia = pedacos
    .map((p) => ({ ini: hhmm(p.inicio), fim: hhmm(p.fim) }))
    .filter((p) => p.ini < p.fim)
    .sort((a, b) => a.ini.localeCompare(b.ini));
  if (doDia.length < 2) return [];

  const vaos: VaoDaGrade[] = [];
  // `fimCorrido` acompanha o ponto mais tarde já coberto: dois pedaços que se
  // sobrepõem (uma ficha encaixada por cima de outra) não podem inventar um vão.
  let fimCorrido = doDia[0].fim;
  for (let i = 1; i < doDia.length; i++) {
    const atual = doDia[i];
    if (atual.ini > fimCorrido) {
      const minutos = emMinutos(atual.ini) - emMinutos(fimCorrido);
      if (minutos >= minMinutos) vaos.push({ inicio: fimCorrido, fim: atual.ini, minutos });
    }
    if (atual.fim > fimCorrido) fimCorrido = atual.fim;
  }
  return vaos;
}

/** A faixa vale nessa data? Vigência em branco significa "sempre". */
const vigenteEm = (f: FaixaGrade, diaIso: string) =>
  (!f.vigencia_inicio || f.vigencia_inicio <= diaIso) &&
  (!f.vigencia_fim || f.vigencia_fim >= diaIso);

/**
 * Vãos da GRADE cadastrada do médico num dia. Esta é a fonte preferida: é o
 * horário que a clínica combinou com ele. As fichas só entram como segunda
 * opção (ver `vaosEntreHorarios`), porque uma ficha gerada por engano dentro
 * do almoço encurtaria o intervalo mostrado — foi o que aconteceu quando as
 * vagas de um dia avançaram sobre a parada do meio-dia.
 */
export function vaosDaGrade(
  faixas: FaixaGrade[],
  diaIso: string,
  diaSemana: number,
  minMinutos = 30,
): VaoDaGrade[] {
  return vaosEntreHorarios(
    faixas
      .filter((f) => f.dia_semana === diaSemana && vigenteEm(f, diaIso))
      .map((f) => ({ inicio: f.hora_inicio, fim: f.hora_fim })),
    minMinutos,
  );
}

/**
 * Como o vão é chamado na tela. Um buraco no meio do dia é almoço; qualquer
 * outro é só um intervalo, e chamar de almoço confundiria a recepção.
 */
export function rotuloDoVao(vao: VaoDaGrade): string {
  return vao.inicio >= "10:30" && vao.inicio <= "14:30" ? "Horário de almoço" : "Intervalo";
}
