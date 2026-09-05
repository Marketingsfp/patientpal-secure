/** Motivo estruturado e texto interno do timeout de espera do paciente. */
export const MOTIVO_TIMEOUT_PACIENTE = "patient_response_timeout";

export function textoInternoTimeout(minutos: number): string {
  return `Paciente sem resposta por ${minutos} minutos — transferido automaticamente pela Nina.`;
}
