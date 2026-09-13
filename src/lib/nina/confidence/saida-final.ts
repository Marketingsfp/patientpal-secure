/**
 * FASE 4 — DECISÃO FINAL ÚNICA E ENCAMINHAMENTO GARANTIDO DE LOW.
 *
 * Este módulo é o ÚNICO ponto que decide o que sai para o paciente, depois da
 * última reescrita do texto. Ele recebe a pontuação da Fase 3 (que vem da
 * avaliação da Fase 2 sobre o contrato da Fase 1) e resolve:
 *
 *   - entrega do candidato, ou
 *   - bloqueio + fila humana + aviso (produção), ou
 *   - bloqueio + registro simulado (homologação, sem NENHUM efeito real).
 *
 * Invariantes:
 *   1. Todo LOW final bloqueia. Não existe exceção final para saudação LOW.
 *   2. A decisão final prevalece sobre qualquer recomendação intermediária
 *      ("continuar saudação", ALLOW, CLARIFY). A divergência é registrada.
 *   3. Comprovação de fila vem de ESTADO PERSISTIDO + chave idempotente.
 *      Texto do modelo nunca comprova encaminhamento (nada de dedupe por
 *      substring do aviso).
 *   4. Homologação bloqueia no ADAPTADOR: as portas reais nem existem.
 *   5. Falha de telemetria não libera LOW. Falha total de avaliação é estado
 *      técnico próprio (`FALHA_DE_AVALIACAO`), nunca HIGH inventado.
 *   6. `apresentacaoConcluida` só é marcada quando o candidato com a
 *      apresentação foi REALMENTE entregue.
 *
 * Módulo puro (portas injetadas). Nada aqui é ativado no atendimento: a
 * ligação conjunta acontece só depois do aceite da Fase 6.
 */
import type { PontuacaoContrato } from "./pontuacao-contrato";
import {
  AVISO_ENCAMINHAMENTO_FALHOU,
  AVISO_ENCAMINHAMENTO_HUMANO,
  AVISO_ENCAMINHAMENTO_SIMULADO,
  type AmbienteSaida,
} from "./baixa-confiabilidade";

export const VERSAO_SAIDA_FINAL = "saida-final-1";

// ------------------------------------------------------------- estado durável

export type EtapaEncaminhamento =
  | "encaminhamento_pendente"
  | "fila_confirmada"
  | "atribuido"
  | "falhou";

export type EstadoAviso = "pendente" | "enviado" | "falhou";

export type RegistroEncaminhamento = {
  /** conversa + turno + solicitação. Uma tentativa por chave. */
  chave: string;
  conversaId: string;
  turnoId: string;
  ambiente: AmbienteSaida;
  etapa: EtapaEncaminhamento;
  /** Comprovante devolvido pelo sistema de fila (protocolo/posição/id). */
  comprovanteFila: string | null;
  atendenteId: string | null;
  aviso: EstadoAviso;
  erro: string | null;
  /** Registro de simulação (homologação) — nunca vira comprovação. */
  simulado: boolean;
  atualizadoEm: string;
};

/** Persistência do encaminhamento. Em produção é uma tabela; aqui é porta. */
export type RepositorioEncaminhamento = {
  ler: (chave: string) => Promise<RegistroEncaminhamento | null>;
  gravar: (r: RegistroEncaminhamento) => Promise<void>;
};

export function repositorioEmMemoria(
  inicial: RegistroEncaminhamento[] = [],
): RepositorioEncaminhamento & { todos: () => RegistroEncaminhamento[] } {
  const mapa = new Map(inicial.map((r) => [r.chave, r]));
  return {
    ler: async (chave) => mapa.get(chave) ?? null,
    gravar: async (r) => {
      mapa.set(r.chave, r);
    },
    todos: () => [...mapa.values()],
  };
}

export function chaveIdempotente(e: {
  conversaId: string;
  turnoId: string;
  solicitacao: string;
}): string {
  return `${e.conversaId}|${e.turnoId}|${e.solicitacao}`;
}

// ------------------------------------------------------------------- portas

export type ResultadoFila = {
  /** A conversa está comprovadamente na fila humana. */
  confirmado: boolean;
  comprovante?: string | null;
  /** Já estava com atendente humano (não duplicar). */
  jaComHumano?: boolean;
  atendenteId?: string | null;
  erro?: string | null;
  /** O sistema não respondeu a tempo: consultar estado antes de repetir. */
  timeout?: boolean;
};

/**
 * Portas com efeito REAL. Em homologação elas são `null` — o bloqueio é no
 * adaptador, não no prompt nem no botão.
 */
export type PortasSaida = {
  entrarNaFilaHumana: (e: {
    conversaId: string;
    motivo: string;
    chave: string;
  }) => Promise<ResultadoFila>;
  /** Consulta o estado real da fila (recuperação após timeout). */
  consultarFila: (e: { conversaId: string; chave: string }) => Promise<ResultadoFila>;
  enviarAviso: (e: { conversaId: string; texto: string; chave: string }) => Promise<{
    ok: boolean;
    erro?: string | null;
  }>;
};

export type Telemetria = (evento: string, dados: Record<string, unknown>) => void | Promise<void>;

// ------------------------------------------------------------------ decisão

export type DesfechoFinal =
  | "ENTREGUE"
  | "BLOQUEADO_ENCAMINHADO"
  | "BLOQUEADO_ENCAMINHAMENTO_PENDENTE"
  | "BLOQUEADO_SIMULADO"
  | "REAVALIAR_TEXTO"
  | "BLOQUEADO_FALHA_DE_AVALIACAO";

export type EntradaSaidaFinal = {
  conversaId: string;
  turnoId: string;
  ambiente: AmbienteSaida;
  /** Texto final, DEPOIS da última reescrita. */
  textoFinal: string;
  /** Hash do texto que a pontuação avaliou. */
  hashAvaliado: string | null;
  /** Hash do texto final atual. Diferente → reavaliar antes de entregar. */
  hashTextoFinal: string | null;
  /** Pontuação da Fase 3 deste mesmo turno. `null` = avaliação falhou. */
  pontuacao: PontuacaoContrato | null;
  /** Falha técnica total da avaliação (não é LOW calculado). */
  falhaDeAvaliacao?: { ocorreu: boolean; detalhe: string } | null;
  /** O paciente pediu explicitamente uma pessoa. */
  pedidoDeHumano?: boolean;
  /** Recomendações de decisores anteriores (registradas, nunca obedecidas). */
  recomendacoesIntermediarias?: string[];
  /** A conversa já está com atendente humano. */
  jaComHumano?: boolean;
  /** O candidato traz a apresentação da assistente. */
  candidatoTemApresentacao?: boolean;
  repositorio: RepositorioEncaminhamento;
  /** Em homologação DEVE ser null: nenhuma porta real disponível. */
  portas: PortasSaida | null;
  telemetria?: Telemetria;
};

export type SaidaFinal = {
  versao: string;
  desfecho: DesfechoFinal;
  /** O que realmente vai para a conversa. */
  mensagemEnviada: string | null;
  candidatoEntregue: boolean;
  /** Nota/hash do candidato preservados mesmo quando descartado. */
  notaCandidato: number | null;
  nivelCandidato: PontuacaoContrato["nivel"] | null;
  hashCandidato: string | null;
  /** O aviso é mensagem controlada: nunca herda a nota do candidato. */
  avisoHerdaNota: false;
  encaminhamento: RegistroEncaminhamento | null;
  /** IA segue pausada aguardando a fila/atendente? */
  iaPausada: boolean;
  apresentacaoConcluida: boolean;
  recomendacoesIntermediarias: string[];
  divergenciaComRecomendacao: boolean;
  motivo: string;
  erroTelemetria: string | null;
};

const MOTIVO_PEDIDO_HUMANO = "pedido_explicito_de_pessoa";
const MOTIVO_LOW = "confianca_baixa_no_texto_final";
const MOTIVO_FALHA = "falha_tecnica_de_avaliacao";

function agora(): string {
  return new Date().toISOString();
}

async function registrar(
  repo: RepositorioEncaminhamento,
  r: RegistroEncaminhamento,
): Promise<RegistroEncaminhamento> {
  const atualizado = { ...r, atualizadoEm: agora() };
  await repo.gravar(atualizado);
  return atualizado;
}

/**
 * Executa fila + aviso com recuperação idempotente. Nunca deriva comprovação
 * do texto: só do estado persistido e do retorno do sistema de fila.
 */
async function encaminharComRecuperacao(
  e: EntradaSaidaFinal,
  chave: string,
  motivo: string,
): Promise<RegistroEncaminhamento> {
  const repo = e.repositorio;
  const existente = await repo.ler(chave);

  let reg: RegistroEncaminhamento =
    existente ??
    (await registrar(repo, {
      chave,
      conversaId: e.conversaId,
      turnoId: e.turnoId,
      ambiente: e.ambiente,
      // Estado durável ANTES da operação.
      etapa: "encaminhamento_pendente",
      comprovanteFila: null,
      atendenteId: null,
      aviso: "pendente",
      erro: null,
      simulado: false,
      atualizadoEm: agora(),
    }));

  const portas = e.portas!;

  if (reg.etapa !== "fila_confirmada" && reg.etapa !== "atribuido") {
    // Retomada após timeout/queda: consulta o estado real antes de repetir.
    let r: ResultadoFila;
    if (existente && existente.etapa === "encaminhamento_pendente") {
      r = await portas.consultarFila({ conversaId: e.conversaId, chave });
      if (!r.confirmado) r = await portas.entrarNaFilaHumana({ conversaId: e.conversaId, motivo, chave });
    } else {
      try {
        r = await portas.entrarNaFilaHumana({ conversaId: e.conversaId, motivo, chave });
      } catch (err) {
        r = { confirmado: false, erro: err instanceof Error ? err.message : "falha_na_fila" };
      }
      if (r.timeout) r = await portas.consultarFila({ conversaId: e.conversaId, chave });
    }

    if (r.confirmado) {
      reg = await registrar(repo, {
        ...reg,
        etapa: r.atendenteId ? "atribuido" : "fila_confirmada",
        comprovanteFila: r.comprovante ?? reg.comprovanteFila ?? null,
        atendenteId: r.atendenteId ?? null,
        erro: null,
      });
    } else {
      // Falha de fila NUNCA vira sucesso: fica pendente/falhou para retomada.
      reg = await registrar(repo, {
        ...reg,
        etapa: r.timeout ? "encaminhamento_pendente" : "falhou",
        erro: r.erro ?? "fila_nao_confirmada",
      });
      return reg;
    }
  }

  // Aviso: só depois da fila confirmada. Falha de envio não duplica fila.
  if (reg.aviso !== "enviado") {
    const texto =
      reg.etapa === "fila_confirmada" || reg.etapa === "atribuido"
        ? AVISO_ENCAMINHAMENTO_HUMANO
        : AVISO_ENCAMINHAMENTO_FALHOU;
    try {
      const env = await portas.enviarAviso({ conversaId: e.conversaId, texto, chave });
      reg = await registrar(repo, {
        ...reg,
        aviso: env.ok ? "enviado" : "falhou",
        erro: env.ok ? reg.erro : (env.erro ?? "aviso_nao_enviado"),
      });
    } catch (err) {
      reg = await registrar(repo, {
        ...reg,
        aviso: "falhou",
        erro: err instanceof Error ? err.message : "aviso_nao_enviado",
      });
    }
  }

  return reg;
}

export async function decidirSaidaFinal(e: EntradaSaidaFinal): Promise<SaidaFinal> {
  const recomendacoes = e.recomendacoesIntermediarias ?? [];
  let erroTelemetria: string | null = null;
  const emitir = async (evento: string, dados: Record<string, unknown>) => {
    if (!e.telemetria) return;
    try {
      await e.telemetria(evento, dados);
    } catch (err) {
      // Telemetria quebrada NÃO libera LOW e NÃO impede o encaminhamento.
      erroTelemetria = err instanceof Error ? err.message : "telemetria_indisponivel";
    }
  };

  const base = {
    versao: VERSAO_SAIDA_FINAL,
    notaCandidato: e.pontuacao?.notaFinal ?? null,
    nivelCandidato: e.pontuacao?.nivel ?? null,
    hashCandidato: e.hashAvaliado ?? null,
    avisoHerdaNota: false as const,
    recomendacoesIntermediarias: recomendacoes,
    apresentacaoConcluida: false,
  };

  // 1. Texto mudou depois da avaliação → reavaliar, nunca entregar no escuro.
  if (
    e.hashAvaliado != null &&
    e.hashTextoFinal != null &&
    e.hashAvaliado !== e.hashTextoFinal
  ) {
    await emitir("saida_final.reavaliar", { conversaId: e.conversaId, turnoId: e.turnoId });
    return {
      ...base,
      desfecho: "REAVALIAR_TEXTO",
      mensagemEnviada: null,
      candidatoEntregue: false,
      encaminhamento: null,
      iaPausada: true,
      divergenciaComRecomendacao: recomendacoes.length > 0,
      motivo: "texto_alterado_apos_avaliacao",
      erroTelemetria,
    };
  }

  const falha = e.falhaDeAvaliacao?.ocorreu === true || e.pontuacao == null;
  const low = !falha && e.pontuacao!.nivel === "LOW";
  const precisaHumano = falha || low || e.pedidoDeHumano === true;

  // 2. Nada exige humano: entrega, se a política de saída permitir.
  if (!precisaHumano) {
    const entrega = e.pontuacao!.decisao === "ENTREGAR";
    await emitir("saida_final.entrega", {
      conversaId: e.conversaId,
      nivel: e.pontuacao!.nivel,
      decisao: e.pontuacao!.decisao,
    });
    return {
      ...base,
      desfecho: entrega ? "ENTREGUE" : "REAVALIAR_TEXTO",
      mensagemEnviada: entrega ? e.textoFinal : null,
      candidatoEntregue: entrega,
      encaminhamento: null,
      iaPausada: !entrega,
      // Só marca apresentação quando o candidato REALMENTE saiu.
      apresentacaoConcluida: entrega && e.candidatoTemApresentacao === true,
      divergenciaComRecomendacao: false,
      motivo: entrega ? e.pontuacao!.motivoDecisao : `decisao_intermediaria:${e.pontuacao!.decisao}`,
      erroTelemetria,
    };
  }

  const motivo = falha ? MOTIVO_FALHA : low ? MOTIVO_LOW : MOTIVO_PEDIDO_HUMANO;
  const chave = chaveIdempotente({
    conversaId: e.conversaId,
    turnoId: e.turnoId,
    solicitacao: motivo,
  });

  // 3. Homologação: nenhuma porta real. Só registro de simulação.
  if (e.ambiente === "homologacao") {
    if (e.portas) throw new Error("homologacao_nao_pode_receber_portas_reais");
    const anterior = await e.repositorio.ler(chave);
    const reg = await registrar(e.repositorio, {
      chave,
      conversaId: e.conversaId,
      turnoId: e.turnoId,
      ambiente: "homologacao",
      etapa: anterior?.etapa ?? "encaminhamento_pendente",
      comprovanteFila: null,
      atendenteId: null,
      aviso: "pendente",
      erro: null,
      simulado: true,
      atualizadoEm: agora(),
    });
    await emitir("saida_final.simulado", { conversaId: e.conversaId, motivo });
    return {
      ...base,
      desfecho: falha ? "BLOQUEADO_FALHA_DE_AVALIACAO" : "BLOQUEADO_SIMULADO",
      mensagemEnviada: AVISO_ENCAMINHAMENTO_SIMULADO,
      candidatoEntregue: false,
      encaminhamento: reg,
      iaPausada: false,
      divergenciaComRecomendacao: recomendacoes.length > 0,
      motivo: `${motivo}:simulado`,
      erroTelemetria,
    };
  }

  // 4. Produção. Conversa já com humano: não duplica nem reativa a IA.
  if (e.jaComHumano === true) {
    await emitir("saida_final.ja_com_humano", { conversaId: e.conversaId, motivo });
    return {
      ...base,
      desfecho: "BLOQUEADO_ENCAMINHADO",
      mensagemEnviada: null,
      candidatoEntregue: false,
      encaminhamento: await e.repositorio.ler(chave),
      iaPausada: true,
      divergenciaComRecomendacao: recomendacoes.length > 0,
      motivo: `${motivo}:ja_com_humano`,
      erroTelemetria,
    };
  }

  if (!e.portas) throw new Error("producao_exige_portas_reais");
  const reg = await encaminharComRecuperacao(e, chave, motivo);
  const confirmado = reg.etapa === "fila_confirmada" || reg.etapa === "atribuido";
  await emitir("saida_final.encaminhado", {
    conversaId: e.conversaId,
    motivo,
    etapa: reg.etapa,
    aviso: reg.aviso,
  });

  return {
    ...base,
    desfecho: falha
      ? "BLOQUEADO_FALHA_DE_AVALIACAO"
      : confirmado
        ? "BLOQUEADO_ENCAMINHADO"
        : "BLOQUEADO_ENCAMINHAMENTO_PENDENTE",
    mensagemEnviada:
      reg.aviso === "enviado"
        ? confirmado
          ? AVISO_ENCAMINHAMENTO_HUMANO
          : AVISO_ENCAMINHAMENTO_FALHOU
        : null,
    candidatoEntregue: false,
    encaminhamento: reg,
    // A IA fica pausada aguardando a fila/atendente; o aviso não reativa.
    iaPausada: true,
    divergenciaComRecomendacao: recomendacoes.length > 0,
    motivo: `${motivo}:${reg.etapa}`,
    erroTelemetria,
  };
}

/** Linha técnica do desfecho, separada do rastreio do candidato. */
export function explicarSaidaFinal(s: SaidaFinal): string {
  return [
    `desfecho=${s.desfecho}`,
    `candidato=${s.nivelCandidato ?? "-"}/${s.notaCandidato ?? "-"} hash=${s.hashCandidato ?? "-"}`,
    `encaminhamento=${s.encaminhamento?.etapa ?? "-"} aviso=${s.encaminhamento?.aviso ?? "-"} simulado=${s.encaminhamento?.simulado ?? false}`,
    `iaPausada=${s.iaPausada} apresentacaoConcluida=${s.apresentacaoConcluida}`,
    `recomendacoes=${s.recomendacoesIntermediarias.join("|") || "-"} divergencia=${s.divergenciaComRecomendacao}`,
    `motivo=${s.motivo} telemetria=${s.erroTelemetria ?? "ok"}`,
  ].join(" | ");
}
