/**
 * Correção de fala em português do Brasil (voz → texto).
 *
 * O reconhecimento do navegador e a transcrição por IA erram muito em nomes
 * próprios e em jargão da clínica ("Nina" → "nine", "sabadinho" → "sabadim").
 * Aqui aplicamos duas camadas, na ordem:
 *
 * 1. substituições diretas (erros que já vimos acontecer);
 * 2. aproximação por semelhança contra um vocabulário do sistema — só troca
 *    quando a palavra falada está a 1 caractere de distância de um termo
 *    conhecido, para nunca "corrigir" uma palavra legítima.
 */

/** Erros diretos observados: regex → texto correto. */
const SUBSTITUICOES: Array<[RegExp, string]> = [
  // Nome da assistente
  [/\b(nine|nina[sz]|niná|nena|nine[ay]|mina|niina)\b/gi, "Nina"],
  // Sábado / sabadinho (plantão de sábado)
  [/\b(sabadim|sabadin|sabadinh[oa]s?|sábadim)\b/gi, "sabadinho"],
  [/\b(sabado|sabádo|sábados)\b/gi, "sábado"],
  // Termos operacionais comuns
  [/\b(agendamento[sz]|agenda mento)\b/gi, "agendamentos"],
  [/\b(rex|erre xis|erre-xis|raio x|raio-x)\b/gi, "RX"],
  [/\b(ultra som|ultrassonografia|ultra-som)\b/gi, "ultrassom"],
  [/\b(tomo grafia)\b/gi, "tomografia"],
  [/\b(resonancia|ressonancia)\b/gi, "ressonância"],
  [/\b(orcamento[s]?)\b/gi, "orçamento"],
  [/\b(hemo grama)\b/gi, "hemograma"],
  [/\b(pix|pics|piques|peaks)\b/gi, "PIX"],
  [/\b(c p f|cepefe|ce pe efe)\b/gi, "CPF"],
  [/\b(who?ts ?app|uatizap|watsap|whatsap)\b/gi, "WhatsApp"],
  [/\b(check in|checkin|chequin|check-in)\b/gi, "check-in"],
  [/\b(pep|p e p)\b/gi, "prontuário"],
  [/\b(hiper dia|hiperdía)\b/gi, "Hiperdia"],
  [/\b(fisio terapia)\b/gi, "fisioterapia"],
  [/\b(nfse|n f s e|nota fiscal de serviço)\b/gi, "NFS-e"],
];

/** Vocabulário do sistema para a correção por semelhança. */
const VOCABULARIO = [
  "Nina",
  "sabadinho",
  "sábado",
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "agenda",
  "agendamento",
  "agendamentos",
  "agendar",
  "reagendar",
  "cancelar",
  "confirmar",
  "paciente",
  "pacientes",
  "médico",
  "médica",
  "consulta",
  "consultas",
  "exame",
  "exames",
  "laboratório",
  "ultrassom",
  "tomografia",
  "ressonância",
  "orçamento",
  "orçamentos",
  "caixa",
  "financeiro",
  "estoque",
  "recepção",
  "triagem",
  "prontuário",
  "convênio",
  "convênios",
  "faturamento",
  "cartão",
  "dinheiro",
  "boleto",
  "parcela",
  "parcelas",
  "hoje",
  "amanhã",
  "ontem",
  "horário",
  "horários",
  "encaixe",
  "fila",
  "atendimento",
  "atendimentos",
  "fisioterapia",
  "enfermagem",
  "Hiperdia",
];

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Distância de edição limitada — retorna >limite quando passa do limite. */
function distancia(a: string, b: string, limite = 1): number {
  if (Math.abs(a.length - b.length) > limite) return limite + 1;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const atual = [i];
    let melhor = i;
    for (let j = 1; j <= b.length; j += 1) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + custo);
      atual[j] = v;
      if (v < melhor) melhor = v;
    }
    if (melhor > limite) return limite + 1;
    anterior = atual;
  }
  return anterior[b.length];
}

const VOCAB_NORM = VOCABULARIO.map((v) => ({ termo: v, norm: semAcento(v.toLowerCase()) }));

/** Aproxima uma palavra do vocabulário quando a diferença é de 1 caractere. */
function aproximar(palavra: string): string {
  const norm = semAcento(palavra.toLowerCase());
  if (norm.length < 4) return palavra;
  for (const v of VOCAB_NORM) if (v.norm === norm) return v.termo;
  let melhor: { termo: string; d: number } | null = null;
  for (const v of VOCAB_NORM) {
    const d = distancia(norm, v.norm, 1);
    if (d <= 1 && (!melhor || d < melhor.d)) melhor = { termo: v.termo, d };
  }
  return melhor ? melhor.termo : palavra;
}

/**
 * Normaliza um trecho reconhecido por voz: arruma espaços, aplica as
 * substituições conhecidas e aproxima palavras do vocabulário da clínica.
 */
export function corrigirFala(texto: string): string {
  let t = texto.replace(/\s+/g, " ").trim();
  if (!t) return "";
  for (const [re, para] of SUBSTITUICOES) t = t.replace(re, para);
  t = t
    .split(" ")
    .map((p) => {
      const m = /^([^\p{L}\d]*)([\p{L}\d'-]+)([^\p{L}\d]*)$/u.exec(p);
      if (!m) return p;
      return `${m[1]}${aproximar(m[2])}${m[3]}`;
    })
    .join(" ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Escolhe, entre as alternativas do reconhecedor, a que mais casa com o
 * vocabulário do sistema (empate resolve pela primeira, que é a mais provável).
 */
export function melhorAlternativa(alternativas: string[]): string {
  let melhor = alternativas[0] ?? "";
  let melhorPontos = -1;
  for (const alt of alternativas) {
    if (!alt) continue;
    const palavras = semAcento(alt.toLowerCase()).split(/[^a-z0-9]+/).filter(Boolean);
    const pontos = palavras.filter((p) => VOCAB_NORM.some((v) => v.norm === p)).length;
    if (pontos > melhorPontos) {
      melhorPontos = pontos;
      melhor = alt;
    }
  }
  return melhor;
}

/** Dica de vocabulário enviada ao modelo de transcrição. */
export const VOCABULARIO_DICA = VOCABULARIO.join(", ");
