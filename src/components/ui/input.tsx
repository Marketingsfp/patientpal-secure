import * as React from "react";

import { cn } from "@/lib/utils";
import { aplicarCaixaAlta, useCaixaAlta } from "@/components/ui/caixa-alta";

export interface InputProps extends React.ComponentProps<"input"> {
  /**
   * Converte o que é digitado para MAIÚSCULO na hora, sem esperar o save.
   *
   * O padrão é LIGADO: a clínica pediu que tudo o que a recepção digita
   * já apareça em caixa alta durante a digitação, mesmo com o Caps Lock
   * desligado, e o banco de qualquer forma grava em caixa alta pelo
   * gatilho `tg_uppercase_text_fields`. Sem isto o campo mostra minúsculo
   * enquanto se digita e o texto "muda sozinho" depois de salvar.
   *
   * Campos de senha, e-mail, endereço de página, data, hora, número,
   * arquivo e cor ficam de fora sozinhos, pelo `type`. Telas inteiras
   * ficam de fora com `<SemCaixaAlta>` (ver `caixa-alta.tsx`).
   *
   * Passe `uppercase={false}` no campo isolado cujo valor é sensível a
   * maiúsculas — chave PIX, comando de atalho, código, link.
   */
  uppercase?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, uppercase, onChange, ...props }, ref) => {
    const emCaixaAlta = useCaixaAlta(uppercase, type);
    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        if (emCaixaAlta) aplicarCaixaAlta(e.currentTarget);
        onChange?.(e);
      },
      [emCaixaAlta, onChange],
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
          emCaixaAlta && "uppercase placeholder:normal-case",
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
