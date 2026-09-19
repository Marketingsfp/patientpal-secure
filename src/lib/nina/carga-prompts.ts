export const PROMPTS_POR_PAGINA = 30;

export type PromptCargaSalvo = {
  id: string;
  pedido: string;
  created_at: string;
  ultimo_usado_em: string;
};

export type PaginaPromptsCarga = { prompts: PromptCargaSalvo[]; temMais: boolean };

/** Repetições entre páginas (outro dispositivo reutilizou um pedido) não duplicam cards. */
export function juntarPromptsCarga(
  anteriores: PromptCargaSalvo[],
  novos: PromptCargaSalvo[],
): PromptCargaSalvo[] {
  return [...new Map([...anteriores, ...novos].map((p) => [p.id, p])).values()];
}
