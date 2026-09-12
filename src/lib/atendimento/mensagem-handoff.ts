/**
 * FASE 2 — mensagem que a Nina envia ao paciente quando o atendimento é
 * encaminhado para a equipe humana.
 *
 * Regras (idênticas em produção, homologação, leads de teste e Test Runner):
 *  - sempre informa que vai encaminhar para pessoas;
 *  - sempre diz que a conversa continua no mesmo canal ("por aqui");
 *  - sempre traz o número de protocolo REAL já gerado na Fase 1;
 *  - nunca inventa setor: só menciona o destino quando ele vem estruturado;
 *  - nunca expõe erro técnico (tool, catálogo, modelo, retrieval, timeout).
 *
 * Este arquivo é PURO (sem banco, sem rede) para poder ser testado e para que
 * a validação valha tanto para o texto gerado pelo modelo quanto para o texto
 * de contingência.
 */

/** Setores que podem ser citados ao paciente quando vierem estruturados. */
export const SETORES_MENCIONAVEIS = [
  "recepção",
  "recepcao",
  "financeiro",
  "agendamento",
  "agendamentos",
  "faturamento",
  "exames",
  "comercial",
  "suporte",
] as const;

/** Motivo funcional do encaminhamento — nunca o erro técnico em si. */
export type MotivoHandoff =
  | "agendamento"
  | "financeiro"
  | "informacao_indisponivel"
  | "pedido_do_paciente"
  | "indefinido";

/** Identidade de APRESENTAÇÃO publicada na aba Arquitetura (FASE 3). */
export interface IdentidadeHandoff {
  assistente?: string | null;
  estabelecimento?: string | null;
  tipoEstabelecimento?: string | null;
}

export interface ContextoMensagemHandoff {
  protocolo: string;
  /** Nome do paciente, quando conhecido. */
  nome?: string | null;
  /** Nome do departamento vindo do cadastro (estruturado). */
  setor?: string | null;
  motivo?: MotivoHandoff;
  /** Assunto em linguagem de atendimento (ex.: "a marcação do ultrassom"). */
  assunto?: string | null;
  /**
   * Identidade efetiva do turno. Ausente = texto neutro; nunca cai para
   * "Nina"/nome administrativo da clínica.
   */
  identidade?: IdentidadeHandoff | null;
}

const TERMOS_TECNICOS = [
  "tool",
  "retrieval",
  "catálogo",
  "catalogo",
  "gemini",
  "openai",
  "prompt",
  "token",
  "api",
  "endpoint",
  "timeout",
  "stack",
  "exception",
  "null",
  "undefined",
  "erro 4",
  "erro 5",
  "http",
  "json",
  "rls",
  "supabase",
  "banco de dados",
  "query",
  "fallback",
  "embedding",
  "log",
];

/** O texto vaza detalhe técnico que o paciente não deve ver? */
export function contemTermoTecnico(texto: string): boolean {
  const t = texto.toLowerCase();
  return TERMOS_TECNICOS.some((termo) => t.includes(termo));
}

/**
 * Só devolve o setor quando ele veio estruturado e é um destino reconhecido.
 * Qualquer outra coisa vira `null` → a mensagem fala em "nossa equipe".
 */
export function setorMencionavel(setor?: string | null): string | null {
  const bruto = (setor ?? "").trim();
  if (!bruto || bruto.length > 40) return null;
  const normal = bruto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const achou = SETORES_MENCIONAVEIS.some(
    (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === normal,
  );
  return achou ? bruto : null;
}

/** "nossa equipe de Recepção" ou "nossa equipe". */
export function destinoTexto(setor?: string | null): string {
  const s = setorMencionavel(setor);
  return s ? `nossa equipe de ${s}` : "nossa equipe";
}

function primeiroNome(nome?: string | null): string | null {
  const n = (nome ?? "").trim().split(/\s+/)[0];
  if (!n || n.length < 2 || /\d/.test(n)) return null;
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export interface ResultadoValidacao {
  ok: boolean;
  problemas: string[];
}

/**
 * Valida o conteúdo obrigatório da mensagem, venha ela do modelo ou do texto
 * de contingência.
 */
export function validarMensagemHandoff(
  texto: string,
  ctx: { protocolo: string; setor?: string | null },
): ResultadoValidacao {
  const problemas: string[] = [];
  const t = (texto ?? "").trim();
  const baixo = t.toLowerCase();

  if (!t) problemas.push("mensagem vazia");
  if (!t.includes(ctx.protocolo)) problemas.push("protocolo ausente");
  if (!/(encaminh|transferi|passar|continuar com nossa|nossa equipe|equipe)/i.test(t))
    problemas.push("não informa o encaminhamento para a equipe");
  if (!/(por aqui|neste canal|nesta conversa|por este canal|aqui mesmo)/i.test(t))
    problemas.push("não informa que o atendimento continua no mesmo canal");
  if (contemTermoTecnico(t)) problemas.push("expõe detalhe técnico");

  const permitido = setorMencionavel(ctx.setor);
  const citouSetor = SETORES_MENCIONAVEIS.some((s) => baixo.includes(s));
  if (citouSetor) {
    const permitidoNorm = (permitido ?? "").toLowerCase();
    if (!permitido || !baixo.includes(permitidoNorm)) problemas.push("menciona setor não estruturado");
  }
  if (t.length > 400) problemas.push("mensagem longa demais");

  return { ok: problemas.length === 0, problemas };
}

/**
 * Texto de contingência: usado quando o modelo não está disponível ou quando
 * a mensagem gerada não passa na validação. Varia por motivo/contexto para não
 * ser sempre a mesma frase.
 */
export function montarMensagemHandoffFallback(ctx: ContextoMensagemHandoff): string {
  const nome = primeiroNome(ctx.nome);
  const destino = destinoTexto(ctx.setor);
  const assunto = (ctx.assunto ?? "").trim();
  const saudacao = nome ? `${nome}, ` : "";
  const sobre = assunto && !contemTermoTecnico(assunto) ? ` sobre ${assunto}` : "";

  let corpo: string;
  switch (ctx.motivo) {
    case "agendamento":
      corpo = `Perfeito, ${saudacao}vou encaminhar seu atendimento para ${destino} continuar a marcação com você por aqui mesmo. 😊`;
      break;
    case "financeiro":
      corpo = `Certo, ${saudacao}vou encaminhar seu atendimento${sobre} para ${destino}, que segue com você por aqui.`;
      break;
    case "informacao_indisponivel":
      corpo = `Para te passar essa informação com segurança, ${saudacao}vou encaminhar seu atendimento para ${destino} continuar por aqui. 😊`;
      break;
    case "pedido_do_paciente":
      corpo = `Claro, ${saudacao}já estou encaminhando seu atendimento para ${destino}. A conversa continua por aqui mesmo.`;
      break;
    default:
      corpo = `${saudacao ? saudacao.charAt(0).toUpperCase() + saudacao.slice(1) : ""}vou encaminhar seu atendimento${sobre} para ${destino} continuar com você por aqui. 😊`;
  }
  corpo = corpo.charAt(0).toUpperCase() + corpo.slice(1);
  return `${corpo}\n\nProtocolo do atendimento: ${ctx.protocolo}`;
}

/** Instrução do modelo para redigir a mensagem contextual. */
export function promptMensagemHandoff(ctx: ContextoMensagemHandoff): string {
  const destino = destinoTexto(ctx.setor);
  // FASE 3 — a identidade vem da versão publicada em Arquitetura. Sem ela, o
  // texto é NEUTRO: nenhuma persona fixa é reintroduzida aqui.
  const assistente = (ctx.identidade?.assistente ?? "").trim();
  const estabelecimento = (ctx.identidade?.estabelecimento ?? "").trim();
  const ondeAtende = estabelecimento ? ` do estabelecimento ${estabelecimento}` : "";
  return [
    assistente
      ? `Você é ${assistente}, a assistente virtual${ondeAtende}, falando por mensagem com o paciente.`
      : `Você é a assistente virtual${ondeAtende}, falando por mensagem com o paciente.`,
    "Escreva UMA mensagem curta (até 3 linhas) avisando que o atendimento será encaminhado para a equipe humana.",
    "Regras obrigatórias:",
    `- diga que vai encaminhar para ${destino};`,
    "- diga que o atendimento continua por aqui (mesmo canal);",
    `- termine com uma linha exatamente assim: Protocolo do atendimento: ${ctx.protocolo}`,
    "- nunca cite outro setor além do informado acima;",
    "- nunca cite erro técnico, ferramenta, sistema, base de dados ou modelo;",
    "- tom acolhedor e natural, sem repetir frases prontas.",
    ctx.nome ? `Nome do paciente: ${ctx.nome}` : "Nome do paciente: desconhecido",
    ctx.assunto ? `Assunto da conversa: ${ctx.assunto}` : "Assunto da conversa: não informado",
    `Motivo do encaminhamento (uso interno): ${ctx.motivo ?? "indefinido"}`,
  ].join("\n");
}

/**
 * Traduz o motivo técnico/interno registrado no handoff para o motivo
 * funcional usado na comunicação com o paciente.
 */
export function classificarMotivoHandoff(motivoBruto?: string | null): MotivoHandoff {
  const m = (motivoBruto ?? "").toLowerCase();
  if (!m) return "indefinido";
  if (/(agenda|marca|remarca|consulta|exame|horário|horario)/.test(m)) return "agendamento";
  if (/(financ|pagam|boleto|valor|preço|preco|cobran|convênio|convenio)/.test(m)) return "financeiro";
  if (/(human|atendente|pessoa|falar com)/.test(m)) return "pedido_do_paciente";
  if (/(sem informa|não encontr|nao encontr|indisponí|indisponi|catálogo|catalogo|erro|falha|tool)/.test(m))
    return "informacao_indisponivel";
  return "indefinido";
}
