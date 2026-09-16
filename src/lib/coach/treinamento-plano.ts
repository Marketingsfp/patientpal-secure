/**
 * Plano de treinamento: o orçamento total de 20 minutos é dividido
 * automaticamente entre as 5 ligações, as 5 conversas de WhatsApp e a prova.
 */
export const LIMITE_TOTAL_MS = 20 * 60 * 1000;
/** Trava de tempo desligada: treinamentos e prova rodam sem limite. */
export const TRAVA_TEMPO_ATIVA: boolean = false;
export const META_LIGACOES = 5;
export const META_WHATSAPP = 5;
/** Nota mínima para um atendimento contar como concluído na trilha. */
export const NOTA_MINIMA = 6;

export type Dificuldade = "facil" | "medio" | "dificil";

export const DIFICULDADES: { valor: Dificuldade; label: string; descricao: string }[] = [
  { valor: "facil", label: "Fácil", descricao: "Paciente receptivo, poucas objeções." },
  { valor: "medio", label: "Médio", descricao: "Dúvidas de preço e horário, objeções comuns." },
  { valor: "dificil", label: "Difícil", descricao: "Paciente apressado, desconfiado e resistente." },
];

/** Um atendimento só conta para a meta quando atinge a nota mínima. */
export function contaParaMeta(nota: number | null | undefined) {
  return (Number(nota) || 0) >= NOTA_MINIMA;
}

/** 5 ligações + 5 conversas + 1 prova */
export const TOTAL_ATIVIDADES = META_LIGACOES + META_WHATSAPP + 1;
/** Cota fixa de cada atividade (~1min49s) */
export const COTA_ATIVIDADE_MS = Math.floor(LIMITE_TOTAL_MS / TOTAL_ATIVIDADES);

export type Atividade = "voz" | "texto" | "prova";

/** Próxima atividade da trilha, na ordem: WhatsApp → ligações → prova. */
export function proximaAtividade(feitasVoz: number, feitasTexto: number): Atividade {
  if (feitasTexto < META_WHATSAPP) return "texto";
  if (feitasVoz < META_LIGACOES) return "voz";
  return "prova";
}

/** Cota disponível para a sessão atual, respeitando o saldo geral. */
export function cotaSessaoMs(usadoMs: number) {
  return Math.max(0, Math.min(COTA_ATIVIDADE_MS, LIMITE_TOTAL_MS - usadoMs));
}

export function formatDuracaoMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
