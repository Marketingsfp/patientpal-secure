import { criarResultado } from "./resposta/contrato";

/** Lê a opção persistida no ciclo; não decide nem inicia encaminhamentos. */
export function handoffSemAviso(resumo: unknown, motivoLegado = ""): boolean {
  const avisar = (resumo as { avisar_paciente?: unknown } | null)?.avisar_paciente;
  if (typeof avisar === "boolean") return !avisar;
  // Compatibilidade somente para ciclos já gravados antes desta opção existir.
  // Todo novo handoff grava true/false e nunca passa por esta interpretação.
  return /\bprofissional[_\s]+(?:e\s+)?sfp\b/.test(
    motivoLegado
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  );
}

export function resultadoHandoffSilencioso() {
  return criarResultado({
    origem: "handoff",
    estado: "descartar",
    texto: "",
    fatosConfirmados: ["handoff_confirmado"],
    restricoes: ["handoff_silencioso_solicitado"],
  });
}
