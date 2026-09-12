/**
 * FASE 3 — ENCADEAMENTO REAL DA DECISÃO DE ENVIO (camada pura).
 *
 * Reproduz, na mesma ordem do atendimento, o caminho que decide o que o
 * paciente recebe:
 *
 *   regras publicadas → motor de confiança (nota calculada, nunca fornecida)
 *   → etapa de ativação (A–D) → conformidade com as instruções
 *   → regra de baixa confiabilidade → saída controlada → marcação da
 *   apresentação.
 *
 * Não há banco, rede, provedor nem transporte aqui. As ações com efeito real
 * (transferência, atribuição de atendente e fila) entram por PORTAS
 * injetadas: em homologação nenhuma delas pode ser chamada, e o registro de
 * chamadas fica disponível para conferência.
 */
import { extrairRegrasPublicadas } from "./regras-publicadas";
import { verificarRespostaFinalDoTurno, type EstadoDoTurno } from "./runtime";
import { aplicarEtapa, type EtapaAtivacao } from "./etapas";
import {
  conformidadeDasInstrucoes,
  decidirEntregaPorConformidade,
  type ConformidadeInstrucoes,
  type DecisaoConformidadeEntrega,
} from "./conformidade-entrega";
import {
  afirmacaoSemLastro,
  decidirBloqueioBaixaConfianca,
  ehAvisoControlado,
  saidaControladaBaixaConfianca,
  type AmbienteSaida,
  type DecisaoBloqueioBaixaConfianca,
  type SaidaControlada,
} from "./baixa-confiabilidade";
import { classificarTipoTurno, type TipoTurno } from "./turno-tipo";
import type { AcaoSolicitada, ResultadoConfianca } from "./types";
import type { IntencaoNina } from "../atendimento-fase1";

/**
 * Tudo que tem efeito real fora da Nina. Homologação recebe portas que
 * registram a tentativa e falham o teste se forem usadas.
 */
export type PortasComEfeitoReal = {
  /** Abre transferência para atendimento humano (efeito real). */
  solicitarAtendenteHumano: (motivo: string) => Promise<{ success: boolean; erro?: string }>;
  /** Atribui a conversa a um atendente (efeito real). */
  atribuirAtendente: (conversaId: string) => Promise<void>;
  /** Coloca a conversa na fila de atendimento (efeito real). */
  entrarNaFila: (conversaId: string) => Promise<void>;
};

export type ChamadaRegistrada = { porta: keyof PortasComEfeitoReal; argumento: string };

export type EntradaCadeia = {
  /** Texto publicado da arquitetura/prompt vigente. */
  publicado: string;
  hashPublicacao?: string;
  mensagemPaciente: string;
  /** Resposta candidata do modelo (o que iria ao paciente). */
  candidata: string;
  etapa: EtapaAtivacao;
  ambiente: AmbienteSaida;
  /** A apresentação já havia sido entregue antes deste turno. */
  apresentacaoJaFeita: boolean;
  /** Intenções detectadas pelo runtime para este turno. */
  intencoes?: IntencaoNina[];
  /** Ação executável autorizada pelo fluxo, quando houver. */
  acao?: AcaoSolicitada | null;
  ferramentas?: EstadoDoTurno["ferramentas"];
  fatos?: EstadoDoTurno["fatos"];
  catalogoEncontrou?: boolean;
  /** A apresentação candidata contradiz a identidade configurada. */
  conflitoDeIdentidade?: boolean;
  portas: PortasComEfeitoReal;
};

export type ResultadoCadeia = {
  tipoTurno: TipoTurno;
  avaliacao: ResultadoConfianca;
  score: number;
  nivel: ResultadoConfianca["level"];
  decisaoMotor: ResultadoConfianca["decision"];
  cobertura: number;
  /** Validadores que ficaram sem conferência (UNKNOWN). */
  regrasDesconhecidas: string[];
  etapa: ReturnType<typeof aplicarEtapa>;
  conformidade: ConformidadeInstrucoes;
  entregaPorConformidade: DecisaoConformidadeEntrega | null;
  bloqueio: DecisaoBloqueioBaixaConfianca;
  saidaControlada: SaidaControlada | null;
  /** O que o paciente (ou o console de teste) realmente vê. */
  mensagemFinal: string;
  entregouCandidata: boolean;
  /** `greeting_completed` foi marcado neste turno? */
  apresentacaoMarcada: boolean;
  /** Motivo curto da decisão final, para o rastreio. */
  motivoDecisao: string;
  chamadasComEfeitoReal: ChamadaRegistrada[];
};

/** Portas de homologação: qualquer uso é registrado e denunciado pelo teste. */
export function portasSemEfeitoReal(registro: ChamadaRegistrada[]): PortasComEfeitoReal {
  return {
    solicitarAtendenteHumano: async (motivo) => {
      registro.push({ porta: "solicitarAtendenteHumano", argumento: motivo });
      return { success: true };
    },
    atribuirAtendente: async (conversaId) => {
      registro.push({ porta: "atribuirAtendente", argumento: conversaId });
    },
    entrarNaFila: async (conversaId) => {
      registro.push({ porta: "entrarNaFila", argumento: conversaId });
    },
  };
}

export async function executarCadeiaDeEnvio(e: EntradaCadeia): Promise<ResultadoCadeia> {
  const chamadas: ChamadaRegistrada[] = [];
  const portas: PortasComEfeitoReal = {
    solicitarAtendenteHumano: async (m) => {
      chamadas.push({ porta: "solicitarAtendenteHumano", argumento: m });
      return e.portas.solicitarAtendenteHumano(m);
    },
    atribuirAtendente: async (c) => {
      chamadas.push({ porta: "atribuirAtendente", argumento: c });
      return e.portas.atribuirAtendente(c);
    },
    entrarNaFila: async (c) => {
      chamadas.push({ porta: "entrarNaFila", argumento: c });
      return e.portas.entrarNaFila(c);
    },
  };

  const hash = e.hashPublicacao ?? "PUBLICACAO-TESTE";
  const { regras, limitacoes } = extrairRegrasPublicadas(e.publicado, {
    escopo: "whatsapp",
    hash,
  });

  const intencoes = e.intencoes ?? [];
  const tipoTurno = classificarTipoTurno({
    mensagem: e.mensagemPaciente,
    intencoes,
    acao: e.acao ?? null,
  });
  const pedidoDeHumano = tipoTurno === "HANDOFF";

  const estado: EstadoDoTurno = {
    texto: e.candidata,
    acao: e.acao ?? null,
    tipoTurno,
    mensagemPaciente: e.mensagemPaciente,
    ferramentas: e.ferramentas ?? [],
    catalogoEncontrou: e.catalogoEncontrou ?? false,
    agendamentoConfirmado: false,
    pacienteIdentificado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: pedidoDeHumano,
    apresentacaoJaFeita: e.apresentacaoJaFeita,
    ambiente: e.ambiente,
    conversaId: "conversa-fase3",
    messageId: "mensagem-fase3",
    instrucoes: {
      escopo: "whatsapp",
      versao: "fase3",
      versaoId: "fase3",
      publicadoEm: null,
      origem: "arquitetura_publicada",
      hash,
      obrigacoes: [],
      regras,
      ...(limitacoes.length ? { limitacoes } : {}),
    },
    ...(e.fatos ? { fatos: e.fatos } : {}),
  };

  // 1) NOTA CALCULADA PELO MOTOR sobre o texto que iria ao paciente.
  const avaliacao = verificarRespostaFinalDoTurno(estado, e.candidata);
  // 2) Etapa de ativação (A–D).
  const etapa = aplicarEtapa(avaliacao, e.etapa);
  // 3) Conformidade com as regras publicadas.
  const conformidade = conformidadeDasInstrucoes(avaliacao);

  // 4) Regra obrigatória de baixa confiabilidade.
  const bloqueio = decidirBloqueioBaixaConfianca({
    nivel: avaliacao.level,
    score: avaliacao.score,
    decisaoMotor: avaliacao.decision,
    etapa: e.etapa,
    ambiente: e.ambiente,
    saudacao: {
      turnoSocial:
        tipoTurno === "SAUDACAO" ||
        (tipoTurno === "ESCLARECIMENTO" && (e.acao ?? null) === null),
      acaoOperacional: (e.acao ?? null) !== null,
      afirmacaoSemFonte: afirmacaoSemLastro(avaliacao),
      pedidoDeHumano,
      conflitoDeIdentidade: e.conflitoDeIdentidade === true,
      conformidadeBloqueante: conformidade.bloqueante,
      conformidadeNaoVerificada:
        conformidade.estado === "nao_verificada" || conformidade.estado === "indeterminada",
    },
    bloqueadoresAbsolutos: avaliacao.hardBlockers ?? [],
    conteudoCandidatoHash: avaliacao.textoAvaliadoHash ?? null,
    avisoJaAplicado: ehAvisoControlado(e.candidata),
  });

  let mensagemFinal = e.candidata;
  let saida: SaidaControlada | null = null;
  let entregaConformidade: DecisaoConformidadeEntrega | null = null;
  let motivo = "candidata entregue: nenhuma regra de bloqueio aplicável";

  if (bloqueio.bloquear && !bloqueio.jaAplicado) {
    if (e.ambiente === "homologacao") {
      // Homologação NÃO aciona ninguém: nenhuma porta com efeito real.
      saida = saidaControladaBaixaConfianca({ tipo: "simulado" });
      motivo = `${bloqueio.motivo}: desfecho simulado (homologação)`;
    } else {
      const r = await portas.solicitarAtendenteHumano(
        "BAIXA_CONFIABILIDADE: resposta reprovada na avaliação final (nível Baixa)",
      );
      if (r.success) {
        await portas.atribuirAtendente("conversa-fase3");
        await portas.entrarNaFila("conversa-fase3");
      }
      saida = saidaControladaBaixaConfianca({
        tipo: "real",
        confirmado: r.success === true,
        comprovacao: r.success ? "conversa-fase3" : null,
        erro: r.erro ?? null,
      });
      motivo = `${bloqueio.motivo}: encaminhamento real (${saida.encaminhamento})`;
    }
    mensagemFinal = saida.aviso;
  } else if (conformidade.bloqueante) {
    entregaConformidade = decidirEntregaPorConformidade({
      conformidade,
      tentativa: 0,
      limiteTentativas: 2,
      correcaoDisponivel: false,
    });
    if (!entregaConformidade.entregar) {
      saida =
        e.ambiente === "homologacao"
          ? saidaControladaBaixaConfianca({ tipo: "simulado" })
          : saidaControladaBaixaConfianca({
              tipo: "real",
              confirmado: (await portas.solicitarAtendenteHumano("REGRA_PUBLICADA_DESCUMPRIDA"))
                .success,
              comprovacao: "conversa-fase3",
            });
      mensagemFinal = saida.aviso;
      motivo = `regra publicada não cumprida (${conformidade.estado}): candidata não entregue`;
    }
  }

  const entregouCandidata = mensagemFinal === e.candidata;
  // `greeting_completed` só é verdade quando a APRESENTAÇÃO foi entregue.
  const apresentacaoMarcada =
    !e.apresentacaoJaFeita && entregouCandidata && !ehAvisoControlado(mensagemFinal);

  return {
    tipoTurno,
    avaliacao,
    score: avaliacao.score,
    nivel: avaliacao.level,
    decisaoMotor: avaliacao.decision,
    cobertura: avaliacao.evidenceCoverage ?? 0,
    regrasDesconhecidas: (avaliacao.validators ?? [])
      .filter((v) => v.status === "UNKNOWN")
      .map((v) => `${v.validator}:${v.reasonCode}`),
    etapa,
    conformidade,
    entregaPorConformidade: entregaConformidade,
    bloqueio,
    saidaControlada: saida,
    mensagemFinal,
    entregouCandidata,
    apresentacaoMarcada,
    motivoDecisao: motivo,
    chamadasComEfeitoReal: chamadas,
  };
}
