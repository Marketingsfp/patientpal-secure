/**
 * REASONING ROUTER DA NINA — política ÚNICA de escolha do nível de raciocínio.
 *
 * Regra do time: o aplicativo decide o nível, não o modelo. E a decisão é por
 * REQUISIÇÃO/ETAPA, não por conversa: a mesma conversa pode usar MEDIUM agora
 * e LOW na mensagem seguinte.
 *
 * Este arquivo é PURO (sem banco, sem rede) para poder ser testado e para que
 * ninguém precise espalhar `if` de reasoning pelo sistema. Quem chama o modelo
 * é o Nina AI Gateway, e é ele quem consulta esta função.
 *
 * Modelo: sempre o mesmo (o da Fase 1). Aqui só muda o esforço de raciocínio.
 */

export type NivelRaciocinio = "low" | "medium" | "high";

export type ContextoRaciocinio = {
  /** Última mensagem do paciente/usuário nesta etapa. */
  mensagem: string;
  /** Rodada do laço de ferramentas (0 = primeira chamada do turno). */
  rodada?: number;
  /** A Nina tem ferramentas disponíveis nesta etapa? */
  temFerramentas?: boolean;
  /** Quantas ferramentas já foram executadas neste turno. */
  ferramentasExecutadas?: number;
  /** Nomes das ferramentas já executadas neste turno (para detectar interdependência). */
  nomesFerramentas?: readonly string[];
  /** Alguma ferramenta devolveu erro / resultado conflitante neste turno. */
  houveConflito?: boolean;
  /** Nível já usado na etapa anterior deste mesmo turno. */
  nivelAnterior?: NivelRaciocinio;
};

export type DecisaoRaciocinio = {
  nivel: NivelRaciocinio;
  motivo: string;
};

const ORDEM: Record<NivelRaciocinio, number> = { low: 0, medium: 1, high: 2 };

/** Assuntos administrativos e factuais → LOW (latência baixa). */
const PADRAO_LOW =
  /\b(ol[áa]|oi|bom dia|boa tarde|boa noite|obrigad[oa]|tchau|endere[çc]o|onde fica|localiza[çc][ãa]o|como chego|estacionamento|whatsapp|telefone|contato|valor|valores|pre[çc]o|quanto custa|custa|tabela|documento|documentos|levar|rg|cpf|carteirinha|pagamento|pagar|pix|cart[ãa]o|boleto|parcel|hor[áa]rio de (funcionamento|atendimento)|abre|fecha|funciona (hoje|amanh[ãa]|s[áa]bado|domingo)|conv[êe]nio)\b/i;

/** Agenda, disponibilidade e alterações que exigem consulta de dados → MEDIUM. */
const PADRAO_MEDIUM =
  /\b(?:agend|marcar|remarc|reagend|cancel|desmarc|disponibilidade|dispon[íi]ve|vaga|hor[áa]rio livre|encaixe|consulta com|exame|dr\.|dra\.|doutor|doutora|m[ée]dic|especialista|cardiolog|dermatolog|ortoped|ginecolog|pediatr|ultrassom|raio[- ]?x|laborat[óo]rio|de manh[ãa]|[àa] tarde|de tarde|[àa] noite|segunda-?feira|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|amanh[ãa]|semana que vem|pr[óo]xima semana)/i;

/** Sinais de caso realmente complexo → HIGH (deve ser raro). */
const PADRAO_ALTERNATIVAS = /\b(ou|alternativ|caso n[ãa]o|se n[ãa]o (der|puder|tiver)|qualquer um dos)\b/i;
const PADRAO_RESTRICAO =
  /\b(depois das?|antes das?|a partir das?|at[ée] as?|s[óo] posso|somente|apenas|n[ãa]o posso|preciso que seja|mesmo dia|no mesmo hor[áa]rio|junto com)\b/i;

function contar(texto: string, re: RegExp): number {
  const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  return (texto.match(global) ?? []).length;
}

/**
 * Escolhe o nível de raciocínio desta etapa.
 *
 * Ordem da política:
 * 1. Conflito/interdependência real de ferramentas → HIGH (exceção).
 * 2. Assunto de agenda/ferramentas/múltiplas restrições → MEDIUM.
 * 3. Resto (saudação, endereço, valores, documentos, KB simples) → LOW.
 *
 * Mensagem longa, por si só, NÃO sobe o nível. Pergunta clínica fora de escopo
 * também não: ela segue as regras atuais de segurança/handoff, sem virar HIGH.
 */
export function selectThinkingLevel(ctx: ContextoRaciocinio): DecisaoRaciocinio {
  const texto = (ctx.mensagem ?? "").trim();
  const rodada = ctx.rodada ?? 0;
  const executadas = ctx.ferramentasExecutadas ?? 0;
  const distintas = new Set(ctx.nomesFerramentas ?? []).size;

  // ---- HIGH: exceção. Só quando o próprio turno mostrou complexidade real.
  if (ctx.houveConflito) {
    return { nivel: "high", motivo: "resultado conflitante ou falha de ferramenta no turno" };
  }
  if (distintas >= 2 && rodada >= 2) {
    return { nivel: "high", motivo: "várias ferramentas interdependentes no mesmo turno" };
  }

  const alternativas = contar(texto, PADRAO_ALTERNATIVAS);
  const restricoes = contar(texto, PADRAO_RESTRICAO);
  const ehAgenda = PADRAO_MEDIUM.test(texto);
  // "Quanto custa Cardiologia?" cita especialidade, mas é pergunta de tabela:
  // intenção administrativa forte vence a menção a agenda, desde que não haja
  // verbo de marcação nem data/período.
  const lowForte =
    /\b(quanto custa|valor|valores|pre[çc]o|tabela|endere[çc]o|onde fica|documento|pagamento|pix|boleto|conv[êe]nio|hor[áa]rio de (funcionamento|atendimento))/i.test(
      texto,
    );
  const agendaForte =
    /\b(?:agend|marcar|remarc|reagend|cancel|desmarc|disponibilidade|dispon[íi]ve|vaga|encaixe|amanh[ãa]|s[áa]bado|domingo|segunda-?feira|ter[çc]a|quarta|quinta|sexta|semana que vem|pr[óo]xima semana|de manh[ãa]|[àa] tarde|[àa] noite)/i.test(
      texto,
    );
  if (lowForte && !agendaForte) {
    return { nivel: "low", motivo: "pergunta administrativa/factual direta" };
  }

  // ---- MEDIUM: agenda, disponibilidade, tools, múltiplas restrições.
  if (ehAgenda) {
    return {
      nivel: "medium",
      motivo:
        alternativas + restricoes >= 2
          ? "agenda com múltiplas restrições"
          : "assunto de agenda/disponibilidade",
    };
  }
  if (rodada > 0 || executadas > 0) {
    return { nivel: "medium", motivo: "etapa com uso de ferramentas" };
  }
  if (alternativas + restricoes >= 2 && ctx.temFerramentas) {
    return { nivel: "medium", motivo: "múltiplas restrições na mesma mensagem" };
  }

  // ---- LOW: administrativo, factual, Base de Conhecimentos simples.
  if (PADRAO_LOW.test(texto) || texto.length === 0) {
    return { nivel: "low", motivo: "pergunta administrativa/factual direta" };
  }
  return { nivel: "low", motivo: "padrão: pergunta simples" };
}

/**
 * Escalonamento controlado: LOW → MEDIUM e, excepcionalmente, MEDIUM → HIGH.
 * Nunca desce dentro do mesmo turno e nunca passa de HIGH — sem loop infinito.
 */
export function escalonar(atual: NivelRaciocinio): NivelRaciocinio {
  if (atual === "low") return "medium";
  if (atual === "medium") return "high";
  return "high";
}

/** Impede que uma etapa posterior do MESMO turno baixe o nível já usado. */
export function nivelNaoRegride(
  novo: NivelRaciocinio,
  anterior?: NivelRaciocinio,
): NivelRaciocinio {
  if (!anterior) return novo;
  return ORDEM[novo] >= ORDEM[anterior] ? novo : anterior;
}

/** Etiqueta de depuração interna. NUNCA pode ser enviada ao paciente. */
export function rotuloDebug(modelo: string, nivel: NivelRaciocinio): string {
  return `Model: ${modelo} | Reasoning: ${nivel.toUpperCase()}`;
}
