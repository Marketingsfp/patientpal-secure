import { classificarErro, decidirRetry } from "./erros";
import { POLITICA_WATCHDOG } from "./watchdog";

/** Somente a preparação, anterior a modelo/ferramentas, pode começar de novo. */
export function repetirPreparacaoNina(args: {
  erro: unknown;
  etapa: string;
  snapshot: unknown;
  entregas: number;
  tentativa: number;
  maxTentativas?: number;
}): boolean {
  if (args.etapa !== "preparing" || args.snapshot || args.entregas || !args.erro) return false;
  const status = Number((args.erro as { status?: unknown })?.status);
  return decidirRetry(
    classificarErro({
      erro: causaFalhaNina(args.erro),
      status: Number.isFinite(status) ? status : null,
    }),
    args.tentativa,
    { maxTentativas: args.maxTentativas ?? POLITICA_WATCHDOG.maxTentativas },
  ).repetir;
}

/** Erro técnico limitado; nunca registra objeto de requisição, payload ou credenciais. */
export function causaFalhaNina(erro: unknown): string {
  const detalhe = erro && typeof erro === "object" ? (erro as { message?: unknown }).message : erro;
  const mensagem = typeof detalhe === "string" ? detalhe : "Falha de processamento";
  return mensagem
    .replace(/https?:\/\/\S+/gi, "[URL omitida]")
    .replace(/Bearer\s+\S+/gi, "Bearer [omitido]")
    .replace(
      /((?:api[_-]?key|access[_-]?token|authorization|password|secret)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[omitido]",
    )
    .replace(/[\r\n]+/g, " ")
    .slice(0, 300);
}
