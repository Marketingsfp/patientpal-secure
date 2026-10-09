import { z } from "zod";

export const decisaoFranciscoSchema = z.object({
  intencao: z.enum(["recusa", "interesse", "duvida"]),
  origem: z.enum(["regra", "gemini", "fallback"]),
  modelo: z.string().optional(),
  uso: z
    .object({
      entrada: z.number().optional(),
      saida: z.number().optional(),
      total: z.number().optional(),
    })
    .optional(),
});
export type DecisaoFrancisco = z.infer<typeof decisaoFranciscoSchema>;

/** Só recusas completas e inequívocas; negações em perguntas não encerram atendimento. */
export function recusaDiretaFrancisco(texto: string): boolean {
  const t = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    /^(sair|pare|parar|cancelar|remover|stop)$/.test(t) ||
    /^(?:nao (?:quero|desejo) (?:receber )?(?:mais )?(?:mensagens|contato)|nao (?:me envie|mandem|envie) (?:mais )?mensagens|pare de (?:mandar|enviar)(?: mensagens)?)(?: por favor| obrigado| obrigada)?$/.test(
      t,
    ) ||
    /^(?:nao|nao quero(?: pagar| continuar| ajuda)?|nao desejo(?: pagar| continuar| ajuda)?|nao tenho interesse|nao estou interessado|nao vou pagar|nao preciso(?: de ajuda)?)(?: obrigado| obrigada)?$/.test(
      t,
    )
  );
}

/** Prévia visual sem provedor; demais respostas precisam de interpretação no servidor. */
export function decisaoLocalFrancisco(texto: string): DecisaoFrancisco {
  return { intencao: recusaDiretaFrancisco(texto) ? "recusa" : "duvida", origem: "regra" };
}
