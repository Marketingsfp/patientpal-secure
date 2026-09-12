/**
 * FASE 5 — SERVIÇO COMUM DE FINALIZAÇÃO DA RESPOSTA (server-only).
 *
 * Ponto ÚNICO por onde passa todo texto antes de virar mensagem, tanto no
 * WhatsApp quanto na Homologação. O que este serviço faz:
 *
 *  1. resolve o texto pelo template publicado (ou pelo padrão do código);
 *  2. aplica a despedida quando o turno encerra o atendimento;
 *  3. confere as promessas do texto contra as evidências reais do turno
 *     (consulta só é dada como marcada com prova de gravação);
 *  4. devolve o texto APROVADO e o seu hash, que é o mesmo texto avaliado e
 *     entregue — o transporte não acrescenta rodapé depois.
 *
 * IDEMPOTÊNCIA: a finalização de um turno roda uma vez só. Chamar de novo com
 * a mesma chave devolve o resultado guardado, sem reexecutar nenhum efeito.
 * Decisões operacionais protegidas (gravar agendamento, transferir, resolver
 * conversa) continuam fora daqui.
 */
import { hashDoTexto } from "@/lib/nina/confidence/hash";
import {
  criarResultado,
  verificarResultado,
  type ResultadoRespostaNina,
} from "./contrato";
import { textoDaChave } from "./templates";
import { carregarTemplatesPublicados } from "./templates.server";

export type CanalFinalizacao = "whatsapp" | "test-console";

export type PedidoFinalizacao = {
  clinicaId: string;
  canal: CanalFinalizacao;
  /** Identificador do turno — também é a chave de idempotência. */
  chaveTurno: string;
  /**
   * FASE 4 — chave do TURNO INTEIRO (sem o sufixo de passe de correção).
   * Serve para o transporte encontrar a ÚLTIMA versão aprovada e para os
   * efeitos externos do turno rodarem uma única vez.
   */
  chaveTurnoRaiz?: string | null;
  conversaId?: string | null;
  telefone?: string | null;
  mensagemPaciente?: string | null;
  resultado: ResultadoRespostaNina;
  handoffPendente?: boolean;
  /** Avaliar encerramento automático (só no caminho real do WhatsApp). */
  avaliarEncerramento?: boolean;
  /**
   * FASE 4 — identidade publicada JÁ resolvida para este turno. Registrada
   * junto do texto para diagnosticar divergências. A finalização não vai ao
   * banco procurar identidade: quem monta o turno já a resolveu.
   */
  identidade?: {
    versao: number | null;
    versaoId: string | null;
    origem: string;
    assistente: string;
    estabelecimento: string;
  } | null;
};

export type RespostaFinalizada = {
  /** Texto aprovado. É exatamente o que deve ser avaliado e entregue. */
  texto: string;
  textoHash: string | null;
  resultado: ResultadoRespostaNina;
  /** Conversa a resolver DEPOIS que o envio for confirmado. */
  encerrarConversaId: string | null;
  /** Origem do texto dos templates usados neste turno. */
  templatesPublicados: boolean;
  /** Retorno de uma finalização já feita para a mesma chave. */
  reaproveitada: boolean;
  /** FASE 4 — texto que entrou nesta finalização (antes das transformações). */
  textoOriginal: string;
  textoOriginalHash: string | null;
  /** FASE 4 — identidade publicada usada neste turno (diagnóstico). */
  identidade: {
    versao: number | null;
    versaoId: string | null;
    origem: string;
    assistente: string;
    estabelecimento: string;
  } | null;
};

/** Chave de idempotência: turno + candidato exato que entrou. */
function chaveDeEntrada(pedido: PedidoFinalizacao): string {
  const bruto = pedido.resultado.texto ?? "";
  return `${pedido.chaveTurno}::${hashDoTexto(bruto) ?? "-"}::${pedido.resultado.chaveTemplate ?? "-"}`;
}

const finalizados = new Map<string, RespostaFinalizada>();
/** FASE 4 — última finalização APROVADA de cada turno (o que o transporte envia). */
const ultimaPorTurno = new Map<string, RespostaFinalizada>();
/** FASE 4 — efeitos externos já avaliados no turno (não se repetem na correção). */
const efeitosPorTurno = new Map<string, { encerrarConversaId: string | null }>();
const LIMITE_CACHE = 500;

function guardar(
  chave: string,
  raiz: string,
  valor: RespostaFinalizada,
): RespostaFinalizada {
  if (finalizados.size > LIMITE_CACHE) finalizados.clear();
  if (ultimaPorTurno.size > LIMITE_CACHE) ultimaPorTurno.clear();
  if (efeitosPorTurno.size > LIMITE_CACHE) efeitosPorTurno.clear();
  finalizados.set(chave, valor);
  ultimaPorTurno.set(raiz, valor);
  return valor;
}

/**
 * FASE 4 — última versão APROVADA do turno. O transporte usa isto para nunca
 * enviar um candidato anterior à correção.
 */
export function ultimaFinalizacaoDoTurno(
  chaveTurnoRaiz: string,
): RespostaFinalizada | null {
  return ultimaPorTurno.get(chaveTurnoRaiz) ?? null;
}

/** Limpa a memória de idempotência (usado em teste). */
export function limparFinalizacoes(): void {
  finalizados.clear();
  ultimaPorTurno.clear();
  efeitosPorTurno.clear();
}

export async function finalizarResposta(
  pedido: PedidoFinalizacao,
): Promise<RespostaFinalizada> {
  const raiz = pedido.chaveTurnoRaiz ?? pedido.chaveTurno;
  const chaveEntrada = chaveDeEntrada(pedido);

  // 1) Mesma entrada, mesmo turno: devolve o resultado guardado.
  const jaFeita = finalizados.get(chaveEntrada);
  if (jaFeita) return { ...jaFeita, reaproveitada: true };

  // 2) O texto que chegou JÁ é uma saída aprovada deste turno (o transporte
  //    reapresentando a correção): devolve a mesma aprovação, sem refazer nada
  //    e sem repetir efeito externo.
  const aprovada = ultimaPorTurno.get(raiz);
  const candidatoHash = hashDoTexto(pedido.resultado.texto ?? "");
  if (aprovada && candidatoHash && aprovada.textoHash === candidatoHash) {
    return { ...aprovada, reaproveitada: true };
  }

  const resultado: ResultadoRespostaNina = { ...pedido.resultado };
  const publicados = await carregarTemplatesPublicados({
    clinicaId: pedido.clinicaId,
    inicioDeTurno: true,
  });
  let usouPublicado = false;

  // 1) Texto determinístico vem sempre do template (publicado ou padrão).
  if (resultado.chaveTemplate) {
    const t = textoDaChave(resultado.chaveTemplate, resultado.variaveis, publicados.textos);
    if (t.texto) {
      resultado.texto = t.texto;
      usouPublicado = t.origemTemplate === "publicado";
    }
    if (t.motivo) resultado.restricoes = [...resultado.restricoes, `template:${t.motivo}`];
  }

  // 2) Encerramento automático: decidido aqui, aplicado só após o envio.
  let encerrarConversaId: string | null = null;
  const efeitoJaAvaliado = efeitosPorTurno.get(raiz);
  if (efeitoJaAvaliado) {
    // Correção do texto no mesmo turno: a decisão de encerrar já foi tomada.
    encerrarConversaId = efeitoJaAvaliado.encerrarConversaId;
  } else if (
    pedido.avaliarEncerramento &&
    resultado.estado === "entregar" &&
    resultado.texto &&
    pedido.telefone &&
    pedido.mensagemPaciente
  ) {
    try {
      const { avaliarEncerramentoAutomatico } = await import(
        "@/lib/nina/encerramento-automatico.server"
      );
      const av = await avaliarEncerramentoAutomatico({
        clinicaId: pedido.clinicaId,
        telefone: pedido.telefone,
        mensagemPaciente: pedido.mensagemPaciente,
        resposta: resultado.texto,
        handoffPendente: pedido.handoffPendente ?? false,
        despedidaPublicada: publicados.textos["encerramento.despedida"] ?? null,
      });
      if (av.encerrar && av.conversaId) {
        resultado.texto = av.resposta;
        encerrarConversaId = av.conversaId;
        resultado.acoesConcluidas = [
          ...resultado.acoesConcluidas,
          {
            acao: "encerrar_conversa",
            idempotencia: `encerrar|${av.conversaId}`,
            confirmada: false,
            evidencia: null,
          },
        ];
      }
      efeitosPorTurno.set(raiz, { encerrarConversaId });
    } catch (e) {
      console.error("[NINA_FINALIZACAO] avaliação de encerramento falhou", e);
    }
  }

  // 3) Promessa sem prova: em caminho determinístico é erro nosso e não sai.
  const check = verificarResultado(resultado);
  if (!check.ok) {
    resultado.restricoes = [...resultado.restricoes, ...check.restricoes];
    const determinista = resultado.origem !== "modelo";
    if (determinista && check.restricoes.some((r) => r.startsWith("confirmacao_de_agendamento"))) {
      const alternativa = textoDaChave("erro.tecnico", {}, publicados.textos);
      resultado.texto = alternativa.texto;
      resultado.chaveTemplate = "erro.tecnico";
      resultado.estado = "entregar";
    }
  }

  const texto = resultado.texto ?? "";
  const textoOriginal = pedido.resultado.texto ?? "";

  // FASE 4 — identidade publicada do turno, registrada junto do texto para
  // diagnosticar divergências entre prévia, payload e mensagem entregue.
  const identidade = pedido.identidade ?? null;

  const finalizada: RespostaFinalizada = {
    texto,
    textoHash: hashDoTexto(texto),
    resultado,
    encerrarConversaId,
    templatesPublicados: usouPublicado,
    reaproveitada: false,
    textoOriginal,
    textoOriginalHash: hashDoTexto(textoOriginal),
    identidade,
  };

  // 4) Rastreabilidade: fica registrado que o texto passou pela finalização.
  try {
    const { registrarTransformacaoResposta } = await import("@/lib/nina/rastreio/turno.server");
    registrarTransformacaoResposta({
      etapa: "finalizacao",
      motivo:
        `origem=${resultado.origem}; template=${resultado.chaveTemplate ?? "-"}; ` +
        `canal=${pedido.canal}; identidade=v${identidade?.versao ?? "-"}/${identidade?.origem ?? "-"}`,
      antesHash: hashDoTexto(pedido.resultado.texto ?? ""),
      depoisHash: finalizada.textoHash,
    });
  } catch {
    /* rastreabilidade nunca interrompe o atendimento */
  }

  return guardar(chaveEntrada, raiz, finalizada);
}

/** Atalho para os caminhos determinísticos simples (mídia, erro, handoff). */
export async function finalizarTemplate(args: {
  clinicaId: string;
  canal: CanalFinalizacao;
  chaveTurno: string;
  origem: ResultadoRespostaNina["origem"];
  chave: string;
  variaveis?: Record<string, string>;
  restricoes?: string[];
}): Promise<RespostaFinalizada> {
  return finalizarResposta({
    clinicaId: args.clinicaId,
    canal: args.canal,
    chaveTurno: args.chaveTurno,
    resultado: criarResultado({
      origem: args.origem,
      texto: "",
      chaveTemplate: args.chave,
      variaveis: args.variaveis ?? {},
      restricoes: args.restricoes ?? [],
    }),
  });
}
