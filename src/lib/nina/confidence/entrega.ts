/**
 * FASE 5 — SAÍDA AVALIADA, REGISTRADA E ENTREGUE (camada pura).
 *
 * Três problemas concretos resolvidos aqui:
 *
 *  1. A mesma nota era reaproveitada só porque o TEXTO tinha o mesmo hash,
 *     mesmo quando o contexto do turno havia mudado (outra revisão da
 *     conversa, outras evidências, outra política). Agora a identidade da
 *     avaliação inclui texto + revisão + evidências + política + motor.
 *
 *  2. Áudio, resumo falado e texto completo são CONTEÚDOS diferentes. Cada
 *     representação carrega a sua própria impressão digital, para que a nota
 *     de um texto nunca pareça avaliação de outro.
 *
 *  3. "Existe linha no banco" não é "o paciente recebeu". Os estados de saída
 *     são explícitos: preparada, persistida, envio tentado, confirmada, falhou.
 *
 * Módulo puro: sem banco, sem rede, sem relógio.
 */
import { hashDoTexto } from "./hash";

/** O que exatamente foi avaliado/entregue naquela linha. */
export const REPRESENTACOES_SAIDA = [
  "texto_completo",
  "audio_integral",
  "audio_resumo",
] as const;
export type RepresentacaoSaida = (typeof REPRESENTACOES_SAIDA)[number];

export const ROTULO_REPRESENTACAO: Record<RepresentacaoSaida, string> = {
  texto_completo: "Texto completo enviado ao paciente",
  audio_integral: "Áudio com o mesmo texto da mensagem",
  audio_resumo: "Áudio com resumo falado (conteúdo diferente do texto)",
};

/**
 * Ciclo de vida da saída. Cada estado é um FATO diferente e nenhum deles
 * autoriza afirmar o seguinte.
 */
export const ESTADOS_ENTREGA = [
  /** Texto aprovado pela finalização e avaliado; nada gravado ainda. */
  "preparada",
  /** Linha gravada em whatsapp_mensagens. Não significa entrega. */
  "persistida",
  /** Chamada de envio disparada para o transporte. */
  "envio_tentado",
  /** O transporte devolveu identificador/confirmação. */
  "confirmada",
  /** O envio falhou e ficou registrado como falha. */
  "falhou",
] as const;
export type EstadoEntrega = (typeof ESTADOS_ENTREGA)[number];

export function entregaConfirmada(estado: EstadoEntrega): boolean {
  return estado === "confirmada";
}

/**
 * Identidade das evidências usadas no turno. Duas avaliações com as mesmas
 * fontes/ferramentas produzem a mesma identidade; qualquer fonte a mais, a
 * menos ou alterada muda o valor.
 */
export function identidadeEvidencias(
  evidencias: ReadonlyArray<unknown> | null | undefined,
): string | null {
  if (!evidencias || evidencias.length === 0) return null;
  const chaves = evidencias
    .map((e) => {
      if (e === null || e === undefined) return "";
      if (typeof e === "string") return e;
      const o = e as Record<string, unknown>;
      const nome = o["ferramenta"] ?? o["tool"] ?? o["fonte"] ?? o["nome"] ?? "";
      const id = o["id"] ?? o["hash"] ?? o["chave"] ?? "";
      const estado = o["status"] ?? o["resultado"] ?? o["estado"] ?? "";
      const conteudo = nome || id || estado ? `${nome}|${id}|${estado}` : JSON.stringify(o);
      return String(conteudo);
    })
    .filter(Boolean)
    .sort();
  if (chaves.length === 0) return null;
  return hashDoTexto(chaves.join("\n"));
}

/**
 * Contexto que uma avaliação de resposta final pertence. Reaproveitar uma nota
 * exige que TODOS estes elementos continuem iguais.
 */
export type ContextoDaAvaliacao = {
  textoFinal: string;
  revisaoConversa: number | null;
  evidenciasHash: string | null;
  policyVersion: string | null;
  engineVersion: string | null;
  representacao: RepresentacaoSaida;
};

export type IdentidadeAvaliacao = {
  textoHash: string | null;
  chave: string;
};

export function identidadeDaAvaliacao(ctx: ContextoDaAvaliacao): IdentidadeAvaliacao {
  const textoHash = hashDoTexto(ctx.textoFinal);
  const chave = [
    textoHash ?? "-",
    ctx.representacao,
    ctx.revisaoConversa === null ? "-" : String(ctx.revisaoConversa),
    ctx.evidenciasHash ?? "-",
    ctx.policyVersion ?? "-",
    ctx.engineVersion ?? "-",
  ].join("::");
  return { textoHash, chave };
}

export type MotivoReuso =
  | "avaliacao_valida"
  | "sem_avaliacao_previa"
  | "texto_alterado_apos_avaliacao"
  | "contexto_alterado_apos_avaliacao";

/**
 * A nota anterior ainda descreve esta saída? Hash igual com contexto diferente
 * NÃO é suficiente — a resposta pode ter sido escrita sobre outras evidências
 * ou outra revisão da conversa.
 */
export function avaliacaoAindaVale(
  previa:
    | { chaveIdentidade?: string | null; textoAvaliadoHash?: string | null }
    | null
    | undefined,
  ctx: ContextoDaAvaliacao,
): { vale: boolean; motivo: MotivoReuso } {
  if (!previa) return { vale: false, motivo: "sem_avaliacao_previa" };
  const atual = identidadeDaAvaliacao(ctx);
  if (previa.chaveIdentidade) {
    if (previa.chaveIdentidade === atual.chave) return { vale: true, motivo: "avaliacao_valida" };
    const mesmoTexto = (previa.textoAvaliadoHash ?? null) === atual.textoHash;
    return {
      vale: false,
      motivo: mesmoTexto ? "contexto_alterado_apos_avaliacao" : "texto_alterado_apos_avaliacao",
    };
  }
  // Avaliação antiga (sem identidade de contexto): só o texto é comparável, e
  // por isso ela nunca é considerada suficiente quando há contexto conhecido.
  if ((previa.textoAvaliadoHash ?? null) !== atual.textoHash) {
    return { vale: false, motivo: "texto_alterado_apos_avaliacao" };
  }
  const temContexto =
    ctx.revisaoConversa !== null || Boolean(ctx.evidenciasHash) || Boolean(ctx.policyVersion);
  return temContexto
    ? { vale: false, motivo: "contexto_alterado_apos_avaliacao" }
    : { vale: true, motivo: "avaliacao_valida" };
}

/** Um registro de saída por representação realmente produzida no turno. */
export type SaidaDoTurno = {
  representacao: RepresentacaoSaida;
  texto: string;
  textoHash: string | null;
  estado: EstadoEntrega;
  outgoingMessageId: string | null;
  transporteId: string | null;
};

export function descreverSaida(args: {
  representacao: RepresentacaoSaida;
  texto: string;
  estado: EstadoEntrega;
  outgoingMessageId?: string | null;
  transporteId?: string | null;
}): SaidaDoTurno {
  return {
    representacao: args.representacao,
    texto: args.texto,
    textoHash: hashDoTexto(args.texto),
    estado: args.estado,
    outgoingMessageId: args.outgoingMessageId ?? null,
    transporteId: args.transporteId ?? null,
  };
}

/**
 * O texto avaliado é o mesmo que foi entregue? Usado nos testes de aceite e no
 * diagnóstico: despedida, erro e handoff também precisam bater.
 */
export function saidaCorrespondeAoAvaliado(
  saida: Pick<SaidaDoTurno, "textoHash" | "representacao">,
  avaliacao: { textoAvaliadoHash?: string | null; representacao?: RepresentacaoSaida | null },
): boolean {
  if ((avaliacao.representacao ?? "texto_completo") !== saida.representacao) return false;
  return Boolean(saida.textoHash) && saida.textoHash === (avaliacao.textoAvaliadoHash ?? null);
}

/** Registros faltantes são detectáveis: toda saída produzida precisa de vínculo. */
export function saidasSemVinculo(
  saidas: ReadonlyArray<SaidaDoTurno>,
  vinculos: ReadonlyArray<{ representacao: string; estado: string }>,
): RepresentacaoSaida[] {
  return saidas
    .filter(
      (s) =>
        !vinculos.some((v) => v.representacao === s.representacao && v.estado === s.estado),
    )
    .map((s) => s.representacao);
}
