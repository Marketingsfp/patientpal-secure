/**
 * FASE 3 — Camada de código: porta de execução real.
 *
 * O atendimento roda em um ambiente sem cópia do repositório, sem processo de
 * build e sem credencial de publicação de código. Por isso NENHUMA correção de
 * código é aplicada aqui, e o sistema também não finge que aplicou: a proposta
 * é registrada com a mudança escrita e o estado fica "aguardando publicação".
 *
 * Se um serviço externo de aplicação de código for configurado (cópia isolada
 * do repositório, aplicar patch, rodar teste e build, commitar e publicar),
 * esta porta passa a chamá-lo de verdade, com chave de repetição e limite de
 * tempo, e devolve o resultado técnico informado por ele — nunca um resultado
 * presumido.
 *
 * Variáveis necessárias para habilitar:
 *  - NINA_EXECUTOR_CODIGO_URL
 *  - NINA_EXECUTOR_CODIGO_TOKEN
 */

export type ResultadoCodigo = {
  disponivel: boolean;
  /** true só quando o serviço externo confirma patch aplicado e publicado. */
  aplicado: boolean;
  publicado: boolean;
  revisaoBase: string | null;
  revisaoNova: string | null;
  testes: string | null;
  motivo: string;
  /** Dependência que falta, quando não é possível aplicar. */
  dependencia: string | null;
};

const DEPENDENCIA =
  "Aplicar correção de código exige um serviço de execução com cópia isolada do repositório, " +
  "permissão para rodar teste e build e credencial de publicação. Esse serviço não está " +
  "configurado neste projeto (NINA_EXECUTOR_CODIGO_URL / NINA_EXECUTOR_CODIGO_TOKEN). " +
  "A mudança fica registrada como pendência técnica com o texto exato do que deve ser feito.";

export function integracaoCodigoDisponivel(): boolean {
  return Boolean(
    process.env["NINA_EXECUTOR_CODIGO_URL"] && process.env["NINA_EXECUTOR_CODIGO_TOKEN"],
  );
}

export async function aplicarMudancaCodigo(entrada: {
  chaveIdempotencia: string;
  clinicaId: string;
  feedbackId: string;
  alvo: string;
  arquivos: string[];
  patch: string | null;
  revisaoBase: string | null;
  instrucao: string;
  tempoMaximoMs: number;
}): Promise<ResultadoCodigo> {
  if (!integracaoCodigoDisponivel()) {
    return {
      disponivel: false,
      aplicado: false,
      publicado: false,
      revisaoBase: entrada.revisaoBase,
      revisaoNova: null,
      testes: null,
      motivo:
        "Mudança de código registrada para publicação. Nada foi alterado no sistema ativo.",
      dependencia: DEPENDENCIA,
    };
  }

  const url = String(process.env["NINA_EXECUTOR_CODIGO_URL"]);
  const token = String(process.env["NINA_EXECUTOR_CODIGO_TOKEN"]);
  const controlador = new AbortController();
  const relogio = setTimeout(() => controlador.abort(), entrada.tempoMaximoMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": entrada.chaveIdempotencia,
      },
      signal: controlador.signal,
      body: JSON.stringify({
        clinica_id: entrada.clinicaId,
        feedback_id: entrada.feedbackId,
        alvo: entrada.alvo,
        arquivos: entrada.arquivos,
        patch: entrada.patch,
        revisao_base: entrada.revisaoBase,
        instrucao: entrada.instrucao,
      }),
    });
    const corpo = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        disponivel: true,
        aplicado: false,
        publicado: false,
        revisaoBase: entrada.revisaoBase,
        revisaoNova: null,
        testes: null,
        motivo: `Serviço de código recusou a aplicação (${res.status}): ${JSON.stringify(corpo).slice(0, 500)}`,
        dependencia: null,
      };
    }
    return {
      disponivel: true,
      aplicado: Boolean(corpo["aplicado"]),
      publicado: Boolean(corpo["publicado"]),
      revisaoBase: (corpo["revisao_base"] as string | null) ?? entrada.revisaoBase,
      revisaoNova: (corpo["revisao_nova"] as string | null) ?? null,
      testes: (corpo["testes"] as string | null) ?? null,
      motivo: String(corpo["motivo"] ?? "Resultado informado pelo serviço de código."),
      dependencia: null,
    };
  } catch (e) {
    return {
      disponivel: true,
      aplicado: false,
      publicado: false,
      revisaoBase: entrada.revisaoBase,
      revisaoNova: null,
      testes: null,
      motivo:
        e instanceof Error && e.name === "AbortError"
          ? "Tempo máximo da aplicação de código excedido. Nada foi publicado."
          : `Falha ao falar com o serviço de código: ${e instanceof Error ? e.message : "desconhecida"}.`,
      dependencia: null,
    };
  } finally {
    clearTimeout(relogio);
  }
}
