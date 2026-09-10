/**
 * FASE 2 — Marcadores, validação e renderização COMPARTILHADOS entre
 * publicação, prévia e runtime.
 *
 * Antes desta fase cada camada tinha a sua própria substituição de texto: a
 * prévia trocava marcadores sem validar, o runtime validava só na hora de
 * responder e a publicação não validava nada. Resultado: dava para publicar
 * uma versão com marcador inexistente, ela virava a versão ativa e o
 * atendimento caía silenciosamente para o texto do código.
 *
 * Agora existe UMA allowlist por escopo e UMA função de renderização.
 * Módulo puro: sem banco, sem rede, sem estado.
 */

export type EscopoInstrucoesTemplate = "whatsapp" | "painel_interno";

/**
 * Marcadores realmente substituídos em cada escopo. Qualquer outro `${...}`
 * é considerado erro de escrita e reprovado ANTES de publicar.
 */
export const MARCADORES_PERMITIDOS: Record<EscopoInstrucoesTemplate, readonly string[]> = {
  whatsapp: ["${nomeUnidade}", "${nomeCurtoUnidade}"],
  painel_interno: ["${contextoTexto}"],
};

/** Todos os `${...}` presentes no texto, na ordem em que aparecem. */
export function marcadoresDoTemplate(template: string): string[] {
  return Array.from(template.matchAll(/\$\{[^}\n]*\}/g)).map((m) => m[0]);
}

export type ValidacaoTemplate =
  | { ok: true; marcadores: string[] }
  | { ok: false; marcador: string; permitidos: readonly string[]; mensagem: string };

/**
 * Reprova o template quando ele usa um marcador que ninguém substitui.
 * A mensagem cita o marcador exato para quem está escrevendo corrigir.
 */
export function validarTemplateInstrucoes(
  escopo: EscopoInstrucoesTemplate,
  template: string,
): ValidacaoTemplate {
  const permitidos = MARCADORES_PERMITIDOS[escopo] ?? [];
  const encontrados = marcadoresDoTemplate(template);
  const desconhecido = encontrados.find((m) => !permitidos.includes(m));
  if (desconhecido) {
    return {
      ok: false,
      marcador: desconhecido,
      permitidos,
      mensagem:
        `O texto usa o marcador ${desconhecido}, que não existe. ` +
        `Marcadores disponíveis neste escopo: ${permitidos.join(", ") || "nenhum"}.`,
    };
  }
  return { ok: true, marcadores: encontrados };
}

export type RenderizacaoTemplate =
  | { ok: true; texto: string }
  | { ok: false; restante: string; mensagem: string };

/**
 * Substitui apenas os marcadores conhecidos. Se sobrar qualquer `${...}`, a
 * renderização falha — marcador cru nunca é enviado ao modelo.
 */
export function renderizarTemplateInstrucoes(
  template: string,
  valores: Record<string, string>,
): RenderizacaoTemplate {
  let texto = template;
  for (const [marcador, valor] of Object.entries(valores)) {
    texto = texto.split(marcador).join(valor ?? "");
  }
  const restante = /\$\{[^}\n]*\}/.exec(texto);
  if (restante) {
    return {
      ok: false,
      restante: restante[0],
      mensagem: `Marcador não substituído: ${restante[0]}.`,
    };
  }
  return { ok: true, texto };
}
