/**
 * FASE 6 — CADEIA REAL, DE PONTA A PONTA, EM UM ÚNICO CAMINHO.
 *
 * Liga as fases anteriores na MESMA ordem do atendimento, usando as funções
 * reais de cada camada (nada de nota fabricada):
 *
 *   prompt/identidade da mesma versão
 *     → compilação do contrato de regras (Fase 1)
 *     → contexto canônico do turno (Fase 2)
 *     → avaliação regra a regra sobre o TEXTO FINAL (Fase 2)
 *     → nota, cobertura, linguagem, segurança da ação (Fase 3)
 *     → decisão final, fila humana e aviso (Fase 4)
 *     → explicação e trilha de auditoria (Fase 5)
 *
 * Invariantes desta camada:
 * - o texto avaliado é o texto final: se o conteúdo mudar depois da avaliação,
 *   a saída exige nova avaliação antes de entregar;
 * - o aviso controlado nunca herda a nota do candidato rejeitado;
 * - homologação não recebe portas com efeito real (o bloqueio é no adaptador);
 * - a trilha de auditoria preserva conteúdo, hash e ordem.
 *
 * Módulo puro: sem banco, sem rede, sem modelo. Dependências externas entram
 * por portas injetadas.
 */
import { compilarContratoRegras, type ContratoRegras } from "./contrato-regras";
import {
  montarContextoCanonico,
  type ContextoCanonico,
  type EntradaContextoCanonico,
} from "./contexto-canonico";
import {
  avaliarContrato,
  type AvaliacaoContrato,
  type OpcoesAvaliacao,
} from "./avaliacao-regras";
import { pontuarContrato, type PontuacaoContrato } from "./pontuacao-contrato";
import { configuracaoPadrao, type ConfiguracaoEfetiva } from "./configuracao";
import {
  decidirSaidaFinal,
  type PortasSaida,
  type RepositorioEncaminhamento,
  type SaidaFinal,
  type Telemetria,
} from "./saida-final";
import { explicarResposta, type ExplicacaoResposta } from "./fase5-explicacao";
import {
  trilhaEmMemoria,
  type EventoAuditoria,
  type Trilha,
} from "./fase5-eventos";
import { hashDoTexto } from "./hash";
import { extrairIdentidade } from "../identidade-atendimento";
import type { IdentidadeAtendimento } from "../identidade-atendimento";

export const VERSAO_CADEIA_INTEGRADA = "cadeia-integrada-6";

export type AmbienteTurno = "producao" | "homologacao";

export type EntradaTurnoIntegrado = {
  conversaId: string;
  turnoId: string;
  /** Texto publicado da Arquitetura (prompt + bloco de identidade). */
  promptPublicado: string;
  versaoPrompt?: string | null;
  versaoIdPrompt?: string | null;
  ambiente: AmbienteTurno;
  mensagemPaciente: string;
  /** Texto candidato produzido pelo modelo. */
  candidato: string;
  /**
   * Texto realmente final, depois da última reescrita. Quando difere do
   * candidato avaliado, a saída exige nova avaliação.
   */
  textoFinal?: string | null;
  configuracao?: ConfiguracaoEfetiva;
  /** Sinais do turno preenchidos pelo SISTEMA (nunca pela mensagem). */
  contexto?: Omit<
    EntradaContextoCanonico,
    "mensagemRecebida" | "candidato" | "ambiente" | "identidadePublicada"
  >;
  opcoesAvaliacao?: OpcoesAvaliacao;
  pedidoDeHumano?: boolean;
  jaComHumano?: boolean;
  recomendacoesIntermediarias?: string[];
  falhaDeAvaliacao?: { ocorreu: boolean; detalhe: string } | null;
  repositorio: RepositorioEncaminhamento;
  /** Em homologação DEVE ser null. */
  portas: PortasSaida | null;
  telemetria?: Telemetria;
  trilha?: Trilha;
  avaliacaoSol?: { veredito: string } | null;
};

export type ResultadoTurnoIntegrado = {
  versao: string;
  contrato: ContratoRegras;
  identidade: IdentidadeAtendimento | null;
  contexto: ContextoCanonico;
  avaliacao: AvaliacaoContrato | null;
  pontuacao: PontuacaoContrato | null;
  saida: SaidaFinal;
  explicacao: ExplicacaoResposta;
  trilha: Trilha;
  eventos: EventoAuditoria[];
  hashAvaliado: string | null;
  hashTextoFinal: string | null;
  /** Versão do prompt efetivamente usada no turno inteiro. */
  versaoPromptUsada: string | null;
  hashPrompt: string | null;
};

function apresentaIdentidade(texto: string, id: IdentidadeAtendimento | null): boolean {
  if (!id) return false;
  const t = texto.toLowerCase();
  return t.includes(id.assistente.toLowerCase()) && t.includes(id.estabelecimento.toLowerCase());
}

export async function executarTurnoIntegrado(
  e: EntradaTurnoIntegrado,
): Promise<ResultadoTurnoIntegrado> {
  if (e.ambiente === "homologacao" && e.portas) {
    throw new Error("homologacao_nao_pode_receber_portas_reais");
  }

  const trilha = e.trilha ?? trilhaEmMemoria();
  const correlacaoId = `${e.conversaId}|${e.turnoId}`;
  const hashPrompt = hashDoTexto(e.promptPublicado);

  // 1) Prompt e identidade da MESMA versão.
  const leitura = extrairIdentidade(e.promptPublicado);
  const identidade = leitura.ok ? leitura.identidade : null;

  // 2) Contrato de regras compilado do texto publicado.
  const contrato = compilarContratoRegras(e.promptPublicado, {
    escopo: "whatsapp",
    versao: e.versaoPrompt ?? null,
    versaoId: e.versaoIdPrompt ?? e.versaoPrompt ?? null,
    hash: hashPrompt,
  });

  // 3) Texto final: é ele que vale para a entrega.
  const textoFinal = (e.textoFinal ?? e.candidato) ?? "";
  // O motor avalia o CANDIDATO; a saída confere se o final é o mesmo texto.
  const textoAvaliado = e.candidato;
  const hashAvaliado = hashDoTexto(textoAvaliado);
  const hashTextoFinal = hashDoTexto(textoFinal);

  // 4) Contexto canônico do turno.
  const contexto = montarContextoCanonico({
    ...(e.contexto ?? {}),
    mensagemRecebida: e.mensagemPaciente,
    candidato: textoAvaliado,
    ambiente: e.ambiente,
    identidadePublicada: identidade,
  });

  const falhou = e.falhaDeAvaliacao?.ocorreu === true;

  let avaliacao: AvaliacaoContrato | null = null;
  let pontuacao: PontuacaoContrato | null = null;

  if (!falhou) {
    // 5) Avaliação regra a regra e 6) conta da nota — funções reais.
    avaliacao = avaliarContrato(contrato, contexto, e.opcoesAvaliacao ?? {});
    pontuacao = pontuarContrato({
      avaliacao,
      configuracao: e.configuracao ?? configuracaoPadrao(),
      ambiente: e.ambiente,
    });
  }

  trilha.registrar({
    tipo: "candidato_avaliado",
    conversaId: e.conversaId,
    turnoId: e.turnoId,
    correlacaoId,
    modo: {
      observacao: false,
      aplicacao: false,
      ambiente: e.ambiente,
      efeito: "nenhum",
    },
    conteudo: textoAvaliado,
    hashConteudo: hashAvaliado,
    dados: {
      nota: pontuacao?.notaFinal ?? null,
      nivel: pontuacao?.nivel ?? null,
      cobertura: pontuacao?.cobertura ?? null,
      falhaDeAvaliacao: falhou,
      versaoPrompt: e.versaoPrompt ?? null,
      hashPrompt,
    },
  });

  if (hashAvaliado !== hashTextoFinal) {
    trilha.registrar({
      tipo: "correcao_de_texto",
      conversaId: e.conversaId,
      turnoId: e.turnoId,
      correlacaoId,
      modo: { observacao: false, aplicacao: false, ambiente: e.ambiente, efeito: "nenhum" },
      conteudo: textoFinal,
      hashConteudo: hashTextoFinal,
      dados: { exigeNovaAvaliacao: true },
    });
  }

  // 7) Decisão final, fila humana e aviso.
  const saida = await decidirSaidaFinal({
    conversaId: e.conversaId,
    turnoId: e.turnoId,
    ambiente: e.ambiente,
    textoFinal,
    hashAvaliado,
    hashTextoFinal,
    pontuacao,
    ...(e.falhaDeAvaliacao ? { falhaDeAvaliacao: e.falhaDeAvaliacao } : {}),
    ...(e.pedidoDeHumano != null ? { pedidoDeHumano: e.pedidoDeHumano } : {}),
    ...(e.jaComHumano != null ? { jaComHumano: e.jaComHumano } : {}),
    ...(e.recomendacoesIntermediarias
      ? { recomendacoesIntermediarias: e.recomendacoesIntermediarias }
      : {}),
    candidatoTemApresentacao: apresentaIdentidade(textoFinal, identidade),
    repositorio: e.repositorio,
    portas: e.portas,
    ...(e.telemetria ? { telemetria: e.telemetria } : {}),
  });

  const reg = saida.encaminhamento;

  // A decisão vem antes da operação: o efeito final é da operação confirmada.
  trilha.registrar({
    tipo: "decisao_final",
    conversaId: e.conversaId,
    turnoId: e.turnoId,
    correlacaoId,
    modo: { observacao: false, aplicacao: true, ambiente: e.ambiente, efeito: "nenhum" },
    conteudo: saida.desfecho,
    hashConteudo: hashDoTexto(`${correlacaoId}|${saida.desfecho}`),
    dados: {
      decisaoDoMotor: pontuacao?.decisao ?? null,
      desfecho: saida.desfecho,
      intermediarias: saida.recomendacoesIntermediarias.join(","),
      divergente: saida.divergenciaComRecomendacao,
    },
  });

  if (reg) {
    trilha.registrar({
      tipo: "operacao_fila",
      conversaId: e.conversaId,
      turnoId: e.turnoId,
      correlacaoId,
      modo: {
        observacao: false,
        aplicacao: !reg.simulado,
        ambiente: e.ambiente,
        efeito:
          reg.etapa === "fila_confirmada" || reg.etapa === "atribuido"
            ? "fila_confirmada"
            : "falhou",
      },
      conteudo: reg.comprovanteFila,
      hashConteudo: hashDoTexto(reg.chave),
      dados: {
        etapa: reg.etapa,
        aviso: reg.aviso,
        simulado: reg.simulado,
        erro: reg.erro,
      },
    });
  }

  if (saida.mensagemEnviada != null) {
    trilha.registrar({
      tipo: "saida_enviada",
      conversaId: e.conversaId,
      turnoId: e.turnoId,
      correlacaoId,
      modo: {
        observacao: false,
        aplicacao: e.ambiente === "producao",
        ambiente: e.ambiente,
        efeito: saida.candidatoEntregue
          ? "resposta_enviada"
          : reg?.aviso === "enviado"
            ? "aviso_enviado"
            : "nenhum",
      },
      conteudo: saida.mensagemEnviada,
      hashConteudo: hashDoTexto(saida.mensagemEnviada),
      dados: {
        candidatoEntregue: saida.candidatoEntregue,
        // O aviso controlado NÃO recebe a nota do candidato rejeitado.
        notaDaMensagem: saida.candidatoEntregue ? (pontuacao?.notaFinal ?? null) : null,
        notaDoCandidato: saida.notaCandidato,
      },
    });
  }

  // 8) Explicação legível do que aconteceu.
  const explicacao = explicarResposta({
    pontuacao,
    avaliacao,
    saida,
    identidade: {
      promptId: e.versaoIdPrompt ?? e.versaoPrompt ?? null,
      promptHash: hashPrompt,
      identidadeId: identidade ? `${identidade.assistente}@${identidade.estabelecimento}` : null,
      hashAvaliado,
      hashTextoFinal,
    },
    ...(falhou ? { falhaDeAvaliacao: e.falhaDeAvaliacao?.detalhe ?? "falha_de_avaliacao" } : {}),
    ...(e.avaliacaoSol ? { avaliacaoSol: e.avaliacaoSol } : {}),
  });

  return {
    versao: VERSAO_CADEIA_INTEGRADA,
    contrato,
    identidade,
    contexto,
    avaliacao,
    pontuacao,
    saida,
    explicacao,
    trilha,
    eventos: trilha.eventos(correlacaoId),
    hashAvaliado,
    hashTextoFinal,
    versaoPromptUsada: e.versaoPrompt ?? null,
    hashPrompt,
  };
}
