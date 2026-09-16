const TZ = "America/Sao_Paulo";

/** Data e hora atuais no fuso do Rio de Janeiro, formatadas em pt-BR. */
export function agoraRio() {
  const agora = new Date();
  const data = agora.toLocaleDateString("pt-BR", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const hora = agora.toLocaleTimeString("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
  const ano = agora.toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 4);
  return { data, hora, ano };
}

/**
 * Bloco de contexto temporal para prompts de IA.
 * Evita que o modelo invente anos antigos (2022/2023) em cenários e feedbacks.
 */
export function contextoDataAtual(): string {
  const { data, hora, ano } = agoraRio();
  return `CONTEXTO TEMPORAL (obrigatório):
- Agora é ${data}, ${hora} (fuso horário de Brasília/Rio de Janeiro, America/Sao_Paulo).
- O ano corrente é ${ano}. NUNCA cite anos passados como se fossem o presente (não use 2022, 2023, 2024, 2025 etc. para datas de hoje, agendamentos ou exemplos).
- Ao sugerir datas de agendamento, use sempre datas futuras a partir de hoje, no ano ${ano}, coerentes com os dias de atendimento da clínica.
- Ao falar de horários, use o horário de Brasília.`;
}

/** Data de hoje (YYYY-MM-DD) no fuso do Rio de Janeiro. */
export function diaRio(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

/**
 * Instante ISO do início do dia atual no fuso do Rio de Janeiro.
 * Usado para zerar o progresso da trilha a cada dia.
 */
export function inicioDoDiaRio(): string {
  const agora = new Date();
  const dia = diaRio(agora);
  // Offset atual de São Paulo (sem horário de verão desde 2019: -03:00)
  const utc = new Date(agora.toLocaleString("sv-SE", { timeZone: "UTC" })).getTime();
  const local = new Date(agora.toLocaleString("sv-SE", { timeZone: TZ })).getTime();
  const offsetMin = Math.round((local - utc) / 60000);
  const sinal = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${dia}T00:00:00${sinal}${hh}:${mm}`;
}

/** Verdadeiro quando o registro foi criado hoje (fuso do Rio). */
export function ehDeHoje(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return diaRio(d) === diaRio();
}
