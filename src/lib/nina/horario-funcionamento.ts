/**
 * Horário de funcionamento da clínica — regras puras de validação.
 *
 * Reutiliza o calendário já existente da Nina
 * (`nina_calendario_atendimento` + `nina_calendario_excecoes`). Não existe um
 * segundo cadastro de horário.
 *
 * Três estados possíveis por dia da semana:
 *  - "aberto"          → uma ou mais faixas cadastradas
 *  - "fechado"         → a clínica declarou que não funciona nesse dia
 *  - "nao_configurado" → ninguém cadastrou nada (NÃO significa fechado)
 *
 * Meia-noite: faixas que atravessam a meia-noite NÃO são aceitas. O usuário
 * recebe a orientação de cadastrar duas faixas (até 23:59 e a partir de 00:00).
 */

export const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

export type EstadoDia = "aberto" | "fechado" | "nao_configurado";

export type Faixa = { hora_inicio: string; hora_fim: string };

export type DiaHorario = {
  dia_semana: number;
  fechado: boolean;
  faixas: Faixa[];
};

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function minutos(hora: string): number {
  const [h, m] = hora.split(":");
  return Number(h) * 60 + Number(m);
}

export function normalizarHora(hora: string): string {
  return String(hora ?? "").slice(0, 5);
}

export function estadoDoDia(dia: DiaHorario | null | undefined): EstadoDia {
  if (!dia) return "nao_configurado";
  if (dia.fechado) return "fechado";
  return dia.faixas.length > 0 ? "aberto" : "nao_configurado";
}

/** Valida um dia inteiro. Devolve a lista de erros em português simples. */
export function validarDia(dia: DiaHorario): string[] {
  const erros: string[] = [];
  if (!Number.isInteger(dia.dia_semana) || dia.dia_semana < 0 || dia.dia_semana > 6) {
    erros.push("Dia da semana inválido.");
  }

  if (dia.fechado) {
    if (dia.faixas.length > 0) {
      erros.push("Um dia marcado como fechado não pode ter faixas de horário.");
    }
    return erros;
  }

  if (dia.faixas.length === 0) return erros; // dia sem configuração: permitido

  dia.faixas.forEach((f, i) => {
    const ini = normalizarHora(f.hora_inicio);
    const fim = normalizarHora(f.hora_fim);
    const rotulo = `Faixa ${i + 1}`;
    if (!RE_HORA.test(ini) || !RE_HORA.test(fim)) {
      erros.push(`${rotulo}: preencha o horário de início e de fim no formato 00:00.`);
      return;
    }
    if (minutos(fim) === minutos(ini)) {
      erros.push(`${rotulo}: o horário de fim não pode ser igual ao de início.`);
      return;
    }
    if (minutos(fim) < minutos(ini)) {
      erros.push(
        `${rotulo}: o fim está antes do início. Horário que passa da meia-noite não é aceito — cadastre uma faixa até 23:59 e outra a partir de 00:00 no dia seguinte.`,
      );
    }
  });

  const validas = dia.faixas
    .map((f, i) => ({ i, ini: minutos(normalizarHora(f.hora_inicio)), fim: minutos(normalizarHora(f.hora_fim)) }))
    .filter((f) => Number.isFinite(f.ini) && Number.isFinite(f.fim) && f.fim > f.ini)
    .sort((a, b) => a.ini - b.ini);

  for (let k = 1; k < validas.length; k++) {
    if (validas[k].ini < validas[k - 1].fim) {
      erros.push("Existem faixas sobrepostas neste dia. Ajuste os horários para que não se cruzem.");
      break;
    }
  }

  return erros;
}

export type Excecao = {
  data: string;
  tipo: "fechado" | "especial";
  hora_inicio?: string | null;
  hora_fim?: string | null;
  descricao?: string | null;
};

export function validarExcecao(e: Excecao): string[] {
  const erros: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.data ?? ""))) erros.push("Informe a data da exceção.");
  if (e.tipo === "especial") {
    const ini = normalizarHora(e.hora_inicio ?? "");
    const fim = normalizarHora(e.hora_fim ?? "");
    if (!RE_HORA.test(ini) || !RE_HORA.test(fim)) {
      erros.push("Funcionamento especial exige horário de início e de fim.");
    } else if (minutos(fim) <= minutos(ini)) {
      erros.push(
        "O fim precisa ser depois do início. Horário que passa da meia-noite não é aceito nesta data — cadastre até 23:59 e continue no dia seguinte.",
      );
    }
  } else if (e.hora_inicio || e.hora_fim) {
    erros.push("Data fechada não deve ter horário preenchido.");
  }
  return erros;
}

export function validarVigencia(inicio: string, fim?: string | null): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(inicio ?? ""))) return ["Informe a partir de quando este horário vale."];
  if (fim && fim < inicio) return ["O fim da vigência não pode ser antes do início."];
  return [];
}

/** Só admin/gestor da clínica podem alterar o horário oficial. */
export function podeEditarHorario(role: string | null | undefined): boolean {
  return ["admin", "gestor"].includes(String(role ?? ""));
}
