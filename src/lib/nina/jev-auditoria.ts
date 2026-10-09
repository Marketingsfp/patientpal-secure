/** Texto do próprio turno, nunca reconstruído pela mensagem mais recente. */
export type TextoDecisaoJev = {
  origem: "paciente" | "resposta_nina" | "termo_busca" | "motivo_transferencia";
  texto: string;
  mensagensEntrada?: string[];
};

const LIMITE_TEXTO = 6000;
export const ROTULO_TEXTO_JEV = {
  paciente: "Mensagem do paciente analisada",
  resposta_nina: "Resposta da Nina conferida (antes do envio)",
  termo_busca: "Termo pesquisado",
  motivo_transferencia: "Motivo da transferência analisado",
} satisfies Record<TextoDecisaoJev["origem"], string>;

export function perguntasComAuditoriaJev(
  chaves: string[],
  contexto?: Record<string, unknown>,
  mensagem?: TextoDecisaoJev,
): string[] | Record<string, unknown> {
  if (!contexto && !mensagem) return chaves;
  return {
    chaves,
    ...contexto,
    ...(mensagem
      ? {
          _texto_analisado: {
            origem: mensagem.origem,
            texto: mensagem.texto.slice(0, LIMITE_TEXTO),
            truncado: mensagem.texto.length > LIMITE_TEXTO,
            mensagens_entrada: [...new Set(mensagem.mensagensEntrada ?? [])],
          },
        }
      : {}),
  };
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export function textoDaDecisaoJev(perguntas: unknown): {
  rotulo: string;
  texto: string;
  truncado: boolean;
} | null {
  const p = objeto(perguntas);
  const m = objeto(p?._texto_analisado);
  if (
    m &&
    typeof m.origem === "string" &&
    Object.hasOwn(ROTULO_TEXTO_JEV, m.origem) &&
    typeof m.texto === "string" &&
    m.texto.trim()
  ) {
    return {
      rotulo: ROTULO_TEXTO_JEV[m.origem as TextoDecisaoJev["origem"]],
      texto: m.texto,
      truncado: m.truncado === true,
    };
  }
  // Fase 3 já registrava o termo; isso não equivale à mensagem inteira.
  if (typeof p?.termo === "string" && p.termo.trim())
    return { rotulo: "Termo pesquisado", texto: p.termo, truncado: false };
  return null;
}

/** IDs legados podem ser texto livre; só UUIDs podem consultar atend_conversas. */
export function idsConversasJev(linhas: Array<{ conversation_id: string | null }>): string[] {
  return [
    ...new Set(
      linhas
        .map((d) => d.conversation_id)
        .filter(
          (id): id is string =>
            typeof id === "string" &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
        ),
    ),
  ];
}
