/** Metadata própria, sem mudar os valores históricos de enviada_por. */
export function mensagemDoFrancisco(raw: unknown): boolean {
  return !!raw && typeof raw === "object" && "agente" in raw && raw.agente === "francisco";
}
