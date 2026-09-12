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
 *   Cadastros › Perfis → perfil "telefonia"
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
  /** Perfil possui a perfil "telefonia" em Cadastros › Perfis. */
  temTelefonia: boolean;
  /** Escolha manual do atendente (fonte oficial). Vazio = ainda não escolheu. */
  status: StatusPresenca | null;
  /** @deprecated FASE 5 — não influencia mais a disponibilidade. */
  aceitaNovas?: boolean;
  /** Pausa aberta (almoço, intervalo etc.). */
  emPausa?: boolean;
  /** Administradores nunca recebem atribuição automática. */
  admin?: boolean;
  /** Fila travada sem nenhuma fila liberada. */
  filaTravada?: boolean;
  /** @deprecated FASE 5 — heartbeat não influencia a disponibilidade. */
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
  // FASE 5 — disponibilidade = ESCOLHA MANUAL do atendente. Heartbeat, foco,
  // aba oculta e tempo sem interação não entram nesta decisão.
  const online = c.status === "ONLINE";
  let motivo: string | null = null;

  if (!c.temTelefonia) motivo = "sem o perfil Telefonia";
  else if (c.admin) motivo = "administrador não recebe atribuição automática";
  else if (!c.status) motivo = "sem escolha de presença";
  else if (c.status !== "ONLINE") motivo = `status ${c.status}`;
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

/**
 * FASE 4 — fila temporária de "Não atribuídas".
 *
 * Cada item guarda o que o evento de entrada na fila precisa preservar:
 * conversa, motivo do handoff, momento em que ficou sem atendente, prioridade,
 * setor/unidade e protocolo (quando existir).
 */
export type ItemNaoAtribuida = {
  conversationId: string;
  handoffReason?: string | null;
  enteredUnassignedAt: string;
  prioridade?: number;
  departamentoId?: string | null;
  protocolo?: string | null;
};

/** Ordem da fila: maior prioridade primeiro; depois, quem espera há mais tempo. */
export function ordenarFilaNaoAtribuidas(itens: ItemNaoAtribuida[]): ItemNaoAtribuida[] {
  return [...itens].sort(
    (a, b) =>
      (b.prioridade ?? 0) - (a.prioridade ?? 0) ||
      a.enteredUnassignedAt.localeCompare(b.enteredUnassignedAt) ||
      a.conversationId.localeCompare(b.conversationId),
  );
}

/**
 * Simula a rotina de redistribuição disparada quando alguém com Telefonia fica
 * Online. Espelha `atend_distribuir_fila_interno`: percorre a fila ordenada e,
 * quando uma conversa não tem atendente compatível (setor/unidade), segue para
 * a próxima em vez de travar a fila inteira.
 */
export function simularRedistribuicao(
  candidatos: CandidatoDistribuicao[],
  fila: ItemNaoAtribuida[],
  opts: { revalidar?: (userId: string) => CandidatoDistribuicao | null } = {},
): {
  atribuicoes: { conversationId: string; userId: string }[];
  restantes: ItemNaoAtribuida[];
} {
  const estado = candidatos.map((c) => ({ ...c, cargaAtiva: c.cargaAtiva ?? 0 }));
  const atribuicoes: { conversationId: string; userId: string }[] = [];
  const restantes: ItemNaoAtribuida[] = [];
  let i = 0;

  for (const item of ordenarFilaNaoAtribuidas(fila)) {
    const r = simularAtribuicao(estado, {
      departamentoId: item.departamentoId ?? null,
      ...(opts.revalidar ? { revalidar: opts.revalidar } : {}),
    });
    if (!r.atribuido_a) {
      restantes.push(item);
      continue;
    }
    atribuicoes.push({ conversationId: item.conversationId, userId: r.atribuido_a });
    const alvo = estado.find((c) => c.userId === r.atribuido_a);
    if (alvo) {
      alvo.cargaAtiva = (alvo.cargaAtiva ?? 0) + 1;
      alvo.ultimaAtribuicaoEm = new Date(2000, 0, 1, 0, 0, i).toISOString();
    }
    i++;
  }

  return { atribuicoes, restantes };
}

/** Contador da Central de Atenção após uma rodada de redistribuição. */
export function contadorNaoAtribuidas(restantes: ItemNaoAtribuida[]): number {
  return restantes.length;
}
