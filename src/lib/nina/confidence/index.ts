/**
 * Fachada do Confidence Decision Engine.
 *
 * O runtime da Nina importa daqui — nunca dos arquivos internos —, para que a
 * implementação possa evoluir sem quebrar quem chama.
 */
export * from "./types";
export {
  aplicarPolitica,
  detectarHardBlockers,
  nivelDaPontuacao,
  POLITICA_PADRAO,
  pontuarValidadores,
  type HardBlocker,
  type PoliticaConfianca,
} from "./policy";
export { decidirConfianca, executarValidadores, LIMITE_HIGH, LIMITE_MEDIUM } from "./engine";
export {
  ActionRiskValidator,
  BusinessRulesValidator,
  ConflictValidator,
  CONFIG_PADRAO_VALIDADORES,
  EntityResolutionValidator,
  executarValidadoresDeConfianca,
  IntentClarityValidator,
  MINIMO_POR_RISCO,
  OfficialSourceValidator,
  RequiredDataValidator,
  riscoDaAcao,
  SourceFreshnessValidator,
  ToolIntegrityValidator,
  type ConfigValidador,
  type ConfigValidadores,
} from "./validators";
export {
  classificarAfirmacaoOperacional,
  WorkflowConsistencyValidator,
  type AfirmacaoOperacional,
} from "./workflow";
// FASE 5 — grounding por afirmação e verificação da resposta final.
export {
  avaliarGrounding,
  ClaimGroundingValidator,
  evidenciasDisponiveis,
  extrairClaimsDoTexto,
  type ClaimAvaliado,
  type ResultadoGrounding,
} from "./claims";
// FASE 1 — tipo do turno e matriz central de aplicabilidade dos validadores.
export {
  acaoDoTipoDeTurno,
  aplicabilidadeDoTurno,
  APLICABILIDADE_DESCONHECIDA,
  classificarTipoTurno,
  ehSaudacaoPura,
  MATRIZ_APLICABILIDADE,
  pedidoLegivelDeEsclarecimento,
  type AplicabilidadeTurno,
  type TipoTurno,
} from "./turno-tipo";
export { avaliacaoCorrespondeAoTexto, hashDoTexto } from "./hash";
export {
  assegurarAvaliacaoDoTextoFinal,
  avaliacaoValeParaOTexto,
  verificarRespostaFinal,
  verificarSegurancaDaAcao,
  type EntradaRespostaFinal,
  type SaidaGateRespostaFinal,
} from "./final-answer";
