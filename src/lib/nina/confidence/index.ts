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
