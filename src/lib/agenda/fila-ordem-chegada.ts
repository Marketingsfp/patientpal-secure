// Posições da fila em agendas de ORDEM DE CHEGADA (medico_agendas.ordem_chegada).
//
// Nessas agendas o médico atende por FICHA: o horário gravado em
// `agendamentos.inicio` só serve para ordenar a fila. A ficha é POSICIONAL
// (ver `numerarFichas` em ficha-numero.ts), então:
//
// - toda ficha nova entra SEMPRE depois do maior `inicio` já existente no dia
//   naquela agenda (inclusive canceladas);
// - nenhuma linha existente pode ser renumerada.
//
// O problema que este helper resolve: com passo fixo de N minutos, um dia que
// precisa de 100–150 fichas estoura o fim do turno (e antes travava em 23:59
// com "Nenhum horário cabe nessa configuração"). Aqui o passo é COMPRIMIDO
// uniformemente até caber — primeiro em minutos dentro do turno, depois em
// segundos até 23:59 do mesmo dia. O relógio aperta; a ordem e a numeração
// continuam íntegras.

export type PosicoesDaFilaInput = {
  /** "YYYY-MM-DD" (dia civil local). */
  diaIso: string;
  /** Maior `inicio` já existente no dia nessa agenda, ou null se o dia está vazio. */
  ultimoInicio: Date | null;
  /** "HH:MM" — início da grade do dia (usado quando não há nada no dia). */
  inicioGrade: string;
  /** "HH:MM" — fim do turno do médico no dia. */
  fimTurno: string;
  /** Quantas fichas acrescentar. */
  quantidade: number;
  /** Passo desejado, em minutos (intervalo da grade). */
  intervaloMin: number;
};

export type PosicoesDaFilaResultado =
  | { ok: true; fichas: Array<{ inicio: Date; fim: Date }> }
  | { ok: false; erro: string };

const MS_MIN = 60000;
const MS_SEG = 1000;

/**
 * Última hora possível para o `inicio` de uma ficha: 23:59:58. O último
 * segundo do dia fica reservado para o `fim`, que precisa ser sempre maior
 * que o `inicio` e nunca passar de 23:59:59.
 */
const limiteInicioDoDia = (diaIso: string) => new Date(`${diaIso}T23:59:58`);
const limiteFimDoDia = (diaIso: string) => new Date(`${diaIso}T23:59:59`);

export function posicoesDaFila(input: PosicoesDaFilaInput): PosicoesDaFilaResultado {
  const { diaIso, ultimoInicio, inicioGrade, fimTurno, quantidade, intervaloMin } = input;
  const n = Math.floor(quantidade);
  if (!Number.isFinite(n) || n < 1) return { ok: false, erro: "Informe quantas fichas gerar." };

  const limiteInicio = limiteInicioDoDia(diaIso);
  const limiteFim = limiteFimDoDia(diaIso);
  const dur = Math.max(1, Math.floor(intervaloMin || 1)) * MS_MIN;

  // Origem da contagem. Com fichas no dia, a primeira nova entra um passo
  // depois da última existente; sem nada no dia, ela nasce no início da grade.
  const temAnterior = !!ultimoInicio;
  const origem = temAnterior ? ultimoInicio!.getTime() : new Date(`${diaIso}T${inicioGrade}:00`).getTime();
  // Quantos passos separam a origem da ÚLTIMA ficha gerada.
  const fator = temAnterior ? n : n - 1;

  if (origem > limiteInicio.getTime()) {
    return {
      ok: false,
      erro: `Não cabem ${n} fichas nesta data. O máximo que ainda cabe é 0.`,
    };
  }

  const fimTurnoMs = Math.min(new Date(`${diaIso}T${fimTurno}:00`).getTime(), limiteInicio.getTime());

  // Maior passo que ainda mantém a última ficha dentro do limite informado.
  const passoMaximo = (limite: number, exclusivo: boolean) => {
    if (fator <= 0) return Number.POSITIVE_INFINITY;
    const disponivel = limite - origem - (exclusivo ? 1 : 0);
    return disponivel <= 0 ? 0 : Math.floor(disponivel / fator);
  };

  let passo: number;
  const noTurno = passoMaximo(fimTurnoMs, true);
  if (fator <= 0) {
    passo = dur;
  } else if (dur <= noTurno) {
    // 1) Cabe tudo com o passo normal, antes do fim do turno.
    passo = dur;
  } else if (noTurno >= MS_MIN) {
    // 2) Comprime o passo em minutos inteiros para caber antes do fim do turno.
    passo = Math.floor(noTurno / MS_MIN) * MS_MIN;
  } else {
    // 3) Nem com 1 minuto cabe no turno: usa o espaço até 23:59 do dia, com
    //    passo em segundos inteiros.
    const noDia = passoMaximo(limiteInicio.getTime(), false);
    const emSegundos = Math.floor(noDia / MS_SEG) * MS_SEG;
    if (emSegundos < MS_SEG) {
      const cabem = Math.floor((limiteInicio.getTime() - origem) / MS_SEG) + (temAnterior ? 0 : 1);
      return {
        ok: false,
        erro: `Não cabem ${n} fichas nesta data. O máximo que ainda cabe é ${Math.max(0, cabem)}.`,
      };
    }
    passo = emSegundos;
  }

  const duracao = Math.min(dur, passo);
  const fichas: Array<{ inicio: Date; fim: Date }> = [];
  for (let k = 0; k < n; k++) {
    const inicioMs = origem + (temAnterior ? k + 1 : k) * passo;
    const fimMs = Math.min(inicioMs + duracao, limiteFim.getTime());
    if (inicioMs > limiteInicio.getTime() || fimMs <= inicioMs) {
      return {
        ok: false,
        erro: `Não cabem ${n} fichas nesta data. O máximo que ainda cabe é ${k}.`,
      };
    }
    fichas.push({ inicio: new Date(inicioMs), fim: new Date(fimMs) });
  }
  return { ok: true, fichas };
}
