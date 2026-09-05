import * as React from "react";

import { cn } from "@/lib/utils";
import { maiusculoDigitacao } from "@/lib/texto-maiusculo";

export interface InputProps extends React.ComponentProps<"input"> {
  /**
   * Converte o que é digitado para MAIÚSCULO na hora, sem esperar o save.
   *
   * Use nos campos de identificação (nome, logradouro, bairro, cidade,
   * descrição de serviço), que o banco já grava em caixa alta pelo gatilho
   * `tg_uppercase_text_fields`. Sem isto o campo mostra minúsculo enquanto
   * se digita e o texto "muda sozinho" depois de salvar.
   *
   * Nunca use em e-mail, senha ou login.
   */
  uppercase?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, uppercase, onChange, ...props }, ref) => {
    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        if (uppercase) {
          const el = e.currentTarget;
          const emCaixaAlta = maiusculoDigitacao(el.value);
          if (emCaixaAlta !== el.value) {
            // Guardar e repor o cursor: sem isto, reescrever o value manda o
            // cursor para o fim e quem corrige uma letra no meio do nome
            // perde a posição a cada tecla. A conversão não muda o número de
            // caracteres, então a posição anterior continua válida.
            const pos = el.selectionStart;
            el.value = emCaixaAlta;
            if (pos !== null) {
              try {
                el.setSelectionRange(pos, pos);
              } catch {
                // Alguns tipos de input (email, number) não aceitam seleção.
                // Nesses casos o valor já foi convertido; só o cursor se perde.
              }
            }
          }
        }
        onChange?.(e);
      },
      [uppercase, onChange],
    );

    return (
      <input
        type={type}
        // `text-sm` sem o par `text-base md:text-sm` de antes: aquele par
        // existia só para o campo ter 16px no celular e o iOS não dar zoom
        // ao focar. Com a nova escala tipográfica o próprio `text-sm` já
        // vale 16px, e manter `text-base` no mobile (agora 18px) estourava
        // a altura fixa `h-9` e cortava o texto digitado.
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          // `placeholder:normal-case` porque `uppercase` também gritaria a
          // dica do campo ("DIGITE O NOME DO PACIENTE").
          uppercase && "uppercase placeholder:normal-case",
          className,
        )}
        ref={ref}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
