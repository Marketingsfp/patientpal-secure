/**
 * Texto que a Nina recebe de uma mensagem de WhatsApp JÁ GRAVADA.
 *
 * Usado pelo webhook e pela resposta acionada pelo banco (17/10/2026): os dois
 * caminhos montam a entrada da Nina pela mesma regra, a partir do que ficou
 * gravado — nunca do que a Meta reenviou.
 *
 * Módulo puro: sem banco e sem rede.
 */
import { textoDaRespostaInterativa } from "@/lib/atendimento/pesquisa-satisfacao";

export type EntradaGravada = {
  tipo?: string | null;
  body?: string | null;
  transcricao?: string | null;
};

export function textoDaEntradaGravada(m: EntradaGravada): string {
  if (m.tipo === "audio" || m.tipo === "image") return m.transcricao ?? "";
  if (m.tipo === "text") return m.body ?? "";
  // Toque em lista ou botão: o título gravado vira a nota (pesquisa) ou o próprio texto.
  if (m.tipo === "interactive" && m.body && m.body !== "[interactive]")
    return textoDaRespostaInterativa(m.body);
  return "";
}
