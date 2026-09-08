/**
 * FASE 5 — Elegibilidade para receber automaticamente um handoff da Nina.
 *
 * Módulo puro (sem rede e sem banco). Ele espelha, em TypeScript, exatamente
 * as mesmas condições da função `public.atend_auto_assign_conversa` no banco,
 * que é a fonte de verdade em Produção. Serve para o Test Runner e para a
 * Homologação afirmarem de forma determinística — sem depender de avaliador de
 * IA — se um usuário poderia ou não receber a conversa.
 *
 * Regra definitiva:
 *   Cadastros › Perfis → permissão "telefonia"
 *   + Online (aceitando novas, presença recente)
 *   + sem pausa aberta
 *   + não administrador
 *   + demais critérios operacionais (setor/fila)
 *
 * Homologação não afrouxa nada: usuário Online sem Telefonia continua
 * inelegível mesmo em ambiente de teste.
 */

export type StatusPresenca = "ONLINE" | "BUSY" | "AWAY" | "OFFLINE";

export type CandidatoDistribuicao = {
  userId: string;
  /** Nome/rótulo apenas para leitura do relatório de teste. */
  nome?: string;
  /** Perfil possui a permissão "telefonia" em Cadastros › Perfis. */
  temTelefonia: boolean;
  status: StatusPresenca;
  /** Marcado como "aceitando novas conversas". Padrão: true quando Online. */
  aceitaNovas?: boolean;
  /** Pausa aberta (almoço, intervalo etc.). */
  emPausa?: boolean;
  /** Administradores nunca recebem atribuição automática. */
  admin?: boolean;
  /** Fila travada sem nenhuma fila liberada. */
  filaTravada?: boolean;
  /** Presença vista há menos de 5 minutos. */
  presencaRecente?: boolean;
  /** Conversas ativas no momento (usado só no balanceamento). */
  cargaAtiva?: number;
  /**
   * Limite de conversas simultâneas do atendente (padrão 5). Quem já atingiu
   * o limite sai do balanceamento — FASE 3.
   */
  capacidadeMaxima?: number;
  /**
   * Último recebimento (histórico completo), para desempate justo: em empate
   * de carga, recebe quem está há mais tempo sem conversa.
   */
  ultimaAtribuicaoEm?: string | null;
  /** Setores a que pertence, quando a conversa tem setor. */
  departamentos?: string[];
};

export type VerificacaoElegibilidade = {
  user_has_telefonia: boolean;
  user_online: boolean;
  eligible_for_nina_handoff: boolean;
  motivo: string | null;
};

/** Avalia um único usuário. */
export function verificarElegibilidade(c: CandidatoDistribuicao): VerificacaoElegibilidade {
  const online = c.status === "ONLINE" && (c.aceitaNovas ?? true) && (c.presencaRecente ?? true);
  let motivo: string | null = null;

  if (!c.temTelefonia) motivo = "sem permissão Telefonia";
  else if (c.admin) motivo = "administrador não recebe atribuição automática";
  else if (c.status !== "ONLINE") motivo = `status ${c.status}`;
  else if (!(c.aceitaNovas ?? true)) motivo = "não está aceitando novas";
  else if (!(c.presencaRecente ?? true)) motivo = "presença desatualizada";
  else if (c.emPausa) motivo = "em pausa";
  else if (c.filaTravada) motivo = "fila travada";
  else if ((c.cargaAtiva ?? 0) >= (c.capacidadeMaxima ?? 5)) motivo = "capacidade lotada";

  return {
    user_has_telefonia: c.temTelefonia,
    user_online: online,
    eligible_for_nina_handoff: motivo === null,
    motivo,
  };
}

/** Pool elegível, na mesma ordem de preferência usada pelo banco. */
export function poolElegivel(
  candidatos: CandidatoDistribuicao[],
  opts: { departamentoId?: string | null } = {},
): CandidatoDistribuicao[] {
  let pool = candidatos.filter((c) => verificarElegibilidade(c).eligible_for_nina_handoff);

  // Setor só filtra quando existe pelo menos um elegível daquele setor.
  const dep = opts.departamentoId ?? null;
  if (dep) {
    const doSetor = pool.filter((c) => (c.departamentos ?? []).includes(dep));
    if (doSetor.length > 0) pool = doSetor;
  }

  return [...pool].sort(
    (a, b) =>
      (a.cargaAtiva ?? 0) - (b.cargaAtiva ?? 0) ||
      String(a.ultimaAtribuicaoEm ?? "").localeCompare(String(b.ultimaAtribuicaoEm ?? "")) ||
      a.userId.localeCompare(b.userId),
  );
}

/**
 * FASE 3 — revalidação imediatamente antes de gravar.
 *
 * Espelha o passo do banco: entre escolher e persistir, a pessoa pode ter
 * entrado em pausa, ficado offline ou perdido a Telefonia. Quem não passa na
 * reconferência é descartado e a vez vai para a próxima da fila.
 */
export function escolherComRevalidacao(
  candidatos: CandidatoDistribuicao[],
  opts: {
    departamentoId?: string | null;
    /** Estado no instante da gravação; devolve `null` para "sem mudança". */
    revalidar?: (userId: string) => CandidatoDistribuicao | null;
  } = {},
): { escolhido: CandidatoDistribuicao | null; descartados: string[] } {
  const descartados: string[] = [];
  for (const c of poolElegivel(candidatos, opts)) {
    const agora = opts.revalidar?.(c.userId) ?? c;
    if (!verificarElegibilidade(agora).eligible_for_nina_handoff) {
      descartados.push(c.userId);
      continue;
    }
    return { escolhido: c, descartados };
  }
  return { escolhido: null, descartados };
}

export type ResultadoDistribuicao = {
  assignment_occurred: boolean;
  /** Quem receberia a conversa; `null` significa fila "Não atribuídas". */
  atribuido_a: string | null;
  /** Motivo estruturado para auditoria/relatório. */
  destino: "atribuida" | "nao_atribuidas";
};

/** Simula a atribuição de UMA conversa (sem tocar em banco algum). */
export function simularAtribuicao(
  candidatos: CandidatoDistribuicao[],
  opts: {
    departamentoId?: string | null;
    revalidar?: (userId: string) => CandidatoDistribuicao | null;
  } = {},
): ResultadoDistribuicao {
  const { escolhido } = escolherComRevalidacao(candidatos, opts);
  return {
    assignment_occurred: Boolean(escolhido),
    atribuido_a: escolhido?.userId ?? null,
    destino: escolhido ? "atribuida" : "nao_atribuidas",
  };
}

/**
 * Simula a distribuição de várias conversas em fila (mais antiga primeiro),
 * incrementando a carga a cada atribuição — é assim que o balanceamento se
 * comporta nas execuções sucessivas da rotina no banco.
 */
export function simularFila(
  candidatos: CandidatoDistribuicao[],
  quantidadeDeConversas: number,
  opts: {
    departamentoId?: string | null;
    revalidar?: (userId: string) => CandidatoDistribuicao | null;
  } = {},
): { atribuicoes: (string | null)[]; naoAtribuidas: number } {
  const estado = candidatos.map((c) => ({ ...c, cargaAtiva: c.cargaAtiva ?? 0 }));
  const atribuicoes: (string | null)[] = [];
  let naoAtribuidas = 0;

  for (let i = 0; i < quantidadeDeConversas; i++) {
    const r = simularAtribuicao(estado, opts);
    atribuicoes.push(r.atribuido_a);
    if (!r.atribuido_a) naoAtribuidas++;
    else {
      const alvo = estado.find((c) => c.userId === r.atribuido_a);
      if (alvo) {
        alvo.cargaAtiva = (alvo.cargaAtiva ?? 0) + 1;
        alvo.ultimaAtribuicaoEm = new Date(2000, 0, 1, 0, 0, i).toISOString();
      }
    }
  }

  return { atribuicoes, naoAtribuidas };
}

/**
 * Perder Telefonia no meio do expediente NÃO retira conversa em andamento.
 * A permissão só decide novas atribuições automáticas.
 */
export function conversaAtribuidaPermanece(args: {
  atribuidaA: string | null;
  usuarioPerdeuTelefonia: boolean;
}): boolean {
  return args.atribuidaA !== null;
}
