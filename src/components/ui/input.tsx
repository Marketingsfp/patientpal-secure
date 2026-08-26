import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
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
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
