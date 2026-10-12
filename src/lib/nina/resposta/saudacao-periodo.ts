import { saudacaoPorHorarioServidor, type SaudacaoPeriodo } from "@/lib/nina-agora";

/**
 * Regra do turno: a saudação segue o horário real do servidor (lido em
 * Brasília), não o cumprimento usado pelo paciente.
 */
export function regraSaudacaoPeriodo(saudacao: SaudacaoPeriodo): string {
  return `SAUDAÇÃO PELO HORÁRIO: sempre que cumprimentar o paciente, use exatamente "${saudacao}", conforme "saudacao_do_periodo" calculada pelo servidor no horário de Brasília ("Bom dia" das 05:00 às 11:59, "Boa tarde" das 12:00 às 17:59, "Boa noite" das 18:00 às 04:59). Não repita o cumprimento do paciente quando ele for de outro período: se o paciente disser "bom dia" à noite, responda "${saudacao}".`;
}

// Abertura opcional ("Olá,", "Oi!", "*Olá*") seguida do cumprimento do período,
// sempre no início da mensagem. Só troca o cumprimento, nada mais.
const ABERTURA_COM_SAUDACAO =
  /^(\s*(?:\*?(?:olá|ola|oi)\*?[\s,!.]*)?\*?)(bom dia|boa tarde|boa noite)(?=$|[\s,!.?:;*])/i;

function noMesmoFormato(original: string, correta: SaudacaoPeriodo): string {
  if (original === original.toUpperCase()) return correta.toUpperCase();
  if (original[0] === original[0]!.toLowerCase()) return correta.toLowerCase();
  return correta;
}

/**
 * Garante que o cumprimento de abertura da mensagem corresponda ao período
 * do horário real do servidor. Só altera "bom dia", "boa tarde" ou "boa noite"
 * no começo do texto (opcionalmente depois de "Olá"/"Oi"), mantendo
 * maiúsculas, pontuação e o restante da mensagem.
 */
export function corrigirSaudacaoDoPeriodo(texto: string, agora: Date = new Date()): string {
  if (!texto) return texto;
  const correta = saudacaoPorHorarioServidor(agora);
  return texto.replace(ABERTURA_COM_SAUDACAO, (trecho, abertura: string, cumprimento: string) =>
    cumprimento.toLowerCase() === correta.toLowerCase()
      ? trecho
      : `${abertura}${noMesmoFormato(cumprimento, correta)}`,
  );
}
