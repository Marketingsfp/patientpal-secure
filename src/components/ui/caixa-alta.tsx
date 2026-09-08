import * as React from "react";
import { maiusculoDigitacao } from "@/lib/texto-maiusculo";

/**
 * Interruptor de caixa alta por área do sistema.
 *
 * A regra da clínica é que tudo o que a recepção digita apareça em
 * MAIÚSCULO na hora, sem depender do Caps Lock. Por isso o padrão do
 * componente `Input` é converter enquanto se digita.
 *
 * Existem, porém, telas onde maiúsculo quebra o conteúdo: texto que sai
 * da clínica para o paciente (mensagem da Nina, campanha, modelo de
 * documento), endereço de página, chave de integração e comando de
 * atalho. Em vez de marcar campo por campo nessas telas, envolvemos a
 * tela inteira com `<SemCaixaAlta>` e o padrão se inverte ali dentro.
 * Um campo isolado ainda pode decidir por conta própria passando
 * `uppercase` explicitamente.
 */
export const CaixaAltaContext = React.createContext<boolean>(true);

/** Desliga a caixa alta automática para tudo o que estiver dentro. */
export function SemCaixaAlta({ children }: { children: React.ReactNode }) {
  return <CaixaAltaContext.Provider value={false}>{children}</CaixaAltaContext.Provider>;
}

/** Liga a caixa alta automática para tudo o que estiver dentro. */
export function ComCaixaAlta({ children }: { children: React.ReactNode }) {
  return <CaixaAltaContext.Provider value={true}>{children}</CaixaAltaContext.Provider>;
}

/**
 * Tipos de campo que nunca podem ser convertidos: ou o valor é
 * sensível a maiúsculas (senha, e-mail, endereço de página) ou o
 * navegador controla o conteúdo (data, hora, número, arquivo, cor) e
 * reescrever o texto atrapalharia a digitação.
 */
const TIPOS_SEM_CAIXA_ALTA = new Set([
  "password",
  "email",
  "url",
  "number",
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
  "color",
  "file",
  "range",
  "checkbox",
  "radio",
  "hidden",
  "image",
  "submit",
  "reset",
  "button",
]);

/** O `type` do campo permite conversão para maiúsculo? */
export function tipoAceitaCaixaAlta(type: string | undefined): boolean {
  return !type || !TIPOS_SEM_CAIXA_ALTA.has(type);
}

/**
 * Decide se um campo converte para maiúsculo: a escolha explícita do
 * campo vence; sem ela, vale o tipo do campo e a área da tela.
 */
export function useCaixaAlta(explicito: boolean | undefined, type: string | undefined): boolean {
  const daArea = React.useContext(CaixaAltaContext);
  if (explicito !== undefined) return explicito;
  if (!tipoAceitaCaixaAlta(type)) return false;
  return daArea;
}

/**
 * Converte para maiúsculo o que já está no campo, preservando o cursor.
 *
 * Sem repor a posição do cursor, reescrever o valor manda o cursor para
 * o fim: quem corrige uma letra no meio do nome perde a posição a cada
 * tecla. A conversão não muda a quantidade de caracteres, então a
 * posição anterior continua válida.
 *
 * Devolve o texto final, que é o que deve ser guardado pela tela.
 */
export function aplicarCaixaAlta(el: HTMLInputElement | HTMLTextAreaElement): string {
  const emCaixaAlta = maiusculoDigitacao(el.value);
  if (emCaixaAlta === el.value) return el.value;
  const pos = el.selectionStart;
  el.value = emCaixaAlta;
  if (pos !== null) {
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      // Alguns tipos de campo não aceitam seleção; o valor já foi
      // convertido e só a posição do cursor se perde.
    }
  }
  return emCaixaAlta;
}
