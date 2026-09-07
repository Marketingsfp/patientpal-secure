/**
 * Fachada do Confidence Decision Engine.
 *
 * O runtime da Nina importa daqui — nunca dos arquivos internos —, para que a
 * implementação possa evoluir sem quebrar quem chama.
 */
export * from "./types";
export { decidirConfianca, executarValidadores, LIMITE_HIGH, LIMITE_MEDIUM } from "./engine";
