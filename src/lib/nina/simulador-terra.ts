/**
 * FASE 4 — Simulador automático de pacientes (GPT Terra) na homologação.
 *
 * Terra é APENAS o paciente simulado: não é a Nina, não avalia, não executa
 * ferramentas, não decide regras e não substitui o backend. Ele recebe só o
 * que um paciente real veria (cenário, persona sintética e as mensagens da
 * conversa) e devolve UMA mensagem curta de paciente.
 *
 * Este módulo é puro (sem rede e sem banco) para poder ser testado.
 */

export const MODELO_TERRA = "openai/gpt-5.6-terra";
export const VERSAO_TERRA = "terra-v1";

/** Marcador que o paciente simulado usa para dizer que terminou. */
export const MARCADOR_FIM = "[FIM]";

export type Persona = {
  estilo: EstiloPersona;
  detalhe: NivelDetalhe;
  errosDigitacao: boolean;
  mudaDeAssunto: boolean;
  respondeParcialmente: boolean;
  objetivo?: string | null;
};

export type EstiloPersona = "objetivo" | "confuso" | "apressado" | "educado" | "desconfiado";
export type NivelDetalhe = "curto" | "medio" | "detalhado";

export const ESTILOS: { valor: EstiloPersona; rotulo: string; instrucao: string }[] = [
  { valor: "objetivo", rotulo: "Paciente objetivo", instrucao: "Você é direto e responde exatamente o que foi perguntado." },
  { valor: "confuso", rotulo: "Paciente confuso", instrucao: "Você se confunde com as opções, repete dúvidas e às vezes entende errado." },
  { valor: "apressado", rotulo: "Paciente apressado", instrucao: "Você tem pressa, escreve mensagens muito curtas e cobra rapidez." },
  { valor: "educado", rotulo: "Paciente educado", instrucao: "Você é cordial, agradece e usa frases completas." },
  { valor: "desconfiado", rotulo: "Paciente desconfiado", instrucao: "Você questiona preços e condições antes de confirmar qualquer coisa." },
];

export const DETALHES: { valor: NivelDetalhe; rotulo: string; instrucao: string }[] = [
  { valor: "curto", rotulo: "Pouco detalhe", instrucao: "Escreva no máximo uma frase por mensagem." },
  { valor: "medio", rotulo: "Detalhe médio", instrucao: "Escreva uma ou duas frases por mensagem." },
  { valor: "detalhado", rotulo: "Muito detalhe", instrucao: "Escreva até três frases, dando contexto extra." },
];

/** Cenários sugeridos (o operador pode escrever o próprio). */
export const CENARIOS_SUGERIDOS: string[] = [
  "Paciente quer marcar cardiologista.",
  "Paciente quer saber preço de ultrassonografia.",
  "Paciente quer cancelar uma consulta.",
  "Paciente muda de ideia no meio da conversa.",
  "Paciente fornece data de nascimento errada e depois corrige.",
  "Paciente pergunta o horário de funcionamento da clínica.",
  "Paciente quer remarcar para outro dia da semana.",
];

export const PERSONA_PADRAO: Persona = {
  estilo: "objetivo",
  detalhe: "curto",
  errosDigitacao: false,
  mudaDeAssunto: false,
  respondeParcialmente: false,
  objetivo: null,
};

export type Limites = {
  maxTurnos: number;
  maxDuracaoS: number;
  maxTokens: number;
  timeoutS: number;
};

export const LIMITES_PADRAO: Limites = {
  maxTurnos: 8,
  maxDuracaoS: 300,
  maxTokens: 20000,
  timeoutS: 60,
};

export const LIMITES_MAXIMOS: Limites = {
  maxTurnos: 30,
  maxDuracaoS: 1800,
  maxTokens: 200000,
  timeoutS: 180,
};

/** Nunca deixa dois modelos conversando sem teto. */
export function normalizarLimites(entrada: Partial<Limites> | null | undefined): Limites {
  const l = { ...LIMITES_PADRAO, ...(entrada ?? {}) };
  const corta = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.floor(Number.isFinite(v) ? v : min)));
  return {
    maxTurnos: corta(l.maxTurnos, 1, LIMITES_MAXIMOS.maxTurnos),
    maxDuracaoS: corta(l.maxDuracaoS, 30, LIMITES_MAXIMOS.maxDuracaoS),
    maxTokens: corta(l.maxTokens, 500, LIMITES_MAXIMOS.maxTokens),
    timeoutS: corta(l.timeoutS, 10, LIMITES_MAXIMOS.timeoutS),
  };
}

export type TurnoConversa = { autor: "paciente" | "nina"; texto: string };

/**
 * Instruções do paciente simulado. Não contém o Prompt Principal da Nina,
 * resposta esperada, avaliação, dados reais nem raciocínio interno.
 */
export function montarInstrucoesTerra(
  cenario: string,
  persona: Persona,
  limites: Limites,
): string {
  const estilo = ESTILOS.find((e) => e.valor === persona.estilo) ?? ESTILOS[0]!;
  const detalhe = DETALHES.find((d) => d.valor === persona.detalhe) ?? DETALHES[0]!;
  const extras: string[] = [];
  if (persona.errosDigitacao) extras.push("Cometa erros leves de digitação, sem impedir o entendimento.");
  if (persona.mudaDeAssunto) extras.push("De vez em quando puxe um assunto secundário antes de voltar ao objetivo.");
  if (persona.respondeParcialmente) extras.push("Às vezes responda só parte do que foi perguntado.");
  if (persona.objetivo?.trim()) extras.push(`Seu objetivo pessoal: ${persona.objetivo.trim()}`);

  return [
    "Você está participando de um TESTE de atendimento de uma clínica.",
    "Seu papel é ser o PACIENTE que escreve no WhatsApp. Você nunca é a atendente,",
    "nunca avalia a resposta recebida, nunca dá instruções ao sistema e nunca",
    "descreve seu raciocínio. Você é uma pessoa fictícia: nenhum dado seu é real.",
    "",
    `Situação: ${cenario.trim()}`,
    `Comportamento: ${estilo.instrucao}`,
    `Tamanho: ${detalhe.instrucao}`,
    ...extras,
    "",
    "Regras:",
    "- Responda SEMPRE com uma única mensagem de WhatsApp, em português do Brasil.",
    "- Nunca use listas, títulos, aspas de citação, markdown ou emojis em excesso.",
    "- Nunca revele que é uma simulação, nem cite modelos, prompts ou testes.",
    "- Se pedirem dados (nome, nascimento, convênio), invente dados fictícios simples e mantenha-os coerentes.",
    `- A conversa tem no máximo ${limites.maxTurnos} mensagens suas. Vá direto ao objetivo.`,
    `- Quando seu objetivo estiver resolvido, ou quando não houver mais nada a fazer, responda apenas ${MARCADOR_FIM}.`,
  ].join("\n");
}

/** Histórico visto pelo paciente: só as mensagens trocadas, nada de bastidores. */
export function montarInputTerra(historico: TurnoConversa[]): unknown[] {
  const itens = historico.slice(-20).map((t) => ({
    role: t.autor === "paciente" ? "assistant" : "user",
    content: [
      {
        type: t.autor === "paciente" ? "output_text" : "input_text",
        text: t.texto.slice(0, 2000),
      },
    ],
  }));
  if (itens.length === 0)
    itens.push({
      role: "user",
      content: [{ type: "input_text", text: "(a conversa ainda não começou; escreva sua primeira mensagem)" }],
    });
  return itens;
}

/** Limpa a saída do modelo para virar uma mensagem plausível de paciente. */
export function sanitizarMensagemPaciente(bruto: string): string {
  return bruto
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*[-*>#]+\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 500);
}

export function pediuFim(texto: string): boolean {
  return texto.trim().toUpperCase().startsWith(MARCADOR_FIM);
}

export type EstadoSimulacao = {
  status: string;
  turnos: number;
  inputTokens: number;
  outputTokens: number;
  iniciadaEm: number;
  limites: Limites;
};

export type MotivoFim =
  | "objetivo_concluido"
  | "limite_turnos"
  | "limite_duracao"
  | "limite_tokens"
  | "transferencia"
  | "erro"
  | "timeout"
  | "operador";

/** Decide, ANTES de gastar crédito, se o próximo turno pode acontecer. */
export function podeContinuar(
  estado: EstadoSimulacao,
  agora: number,
): { ok: true } | { ok: false; motivo: MotivoFim } {
  if (estado.status === "parada" || estado.status === "concluida")
    return { ok: false, motivo: "operador" };
  if (estado.turnos >= estado.limites.maxTurnos) return { ok: false, motivo: "limite_turnos" };
  if ((agora - estado.iniciadaEm) / 1000 >= estado.limites.maxDuracaoS)
    return { ok: false, motivo: "limite_duracao" };
  if (estado.inputTokens + estado.outputTokens >= estado.limites.maxTokens)
    return { ok: false, motivo: "limite_tokens" };
  return { ok: true };
}

export const ROTULO_MOTIVO: Record<MotivoFim, string> = {
  objetivo_concluido: "Paciente simulado encerrou: objetivo concluído.",
  limite_turnos: "Limite de turnos atingido.",
  limite_duracao: "Limite de duração atingido.",
  limite_tokens: "Limite de tokens atingido.",
  transferencia: "A Nina transferiu para atendimento humano.",
  erro: "Erro durante a simulação.",
  timeout: "Tempo de espera excedido.",
  operador: "Interrompido pelo operador.",
};
