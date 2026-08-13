import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { mascaraCPF, mascaraTelefone, limparCPF, limparTelefone } from "@/lib/validators";

export { mascaraCPF, mascaraTelefone, limparCPF, limparTelefone };

type Base = Omit<React.ComponentProps<typeof Input>, "onChange" | "value"> & {
  value: string | null | undefined;
  /** Recebe o valor já formatado. Use limparCPF/limparTelefone antes de salvar. */
  onChange: (formatado: string, digitos: string) => void;
};

/** Bloqueia qualquer tecla que não seja dígito (permite navegação/atalhos). */
function bloquearNaoNumerico(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length !== 1) return; // Backspace, Tab, setas etc.
  if (!/\d/.test(e.key)) e.preventDefault();
}

/** Campo de telefone com máscara (XX) XXXXX-XXXX e no máximo 11 dígitos. */
export const InputTelefone = forwardRef<HTMLInputElement, Base>(function InputTelefone(
  { value, onChange, ...rest },
  ref,
) {
  return (
    <Input
      ref={ref}
      inputMode="numeric"
      autoComplete="tel"
      maxLength={15}
      placeholder="(00) 00000-0000"
      {...rest}
      value={mascaraTelefone(value ?? "")}
      onKeyDown={(e) => {
        bloquearNaoNumerico(e);
        rest.onKeyDown?.(e);
      }}
      onPaste={(e) => {
        e.preventDefault();
        const texto = e.clipboardData.getData("text");
        const d = limparTelefone(`${value ?? ""}${texto}`).slice(0, 11);
        onChange(mascaraTelefone(d), d);
      }}
      onChange={(e) => {
        const d = limparTelefone(e.target.value).slice(0, 11);
        onChange(mascaraTelefone(d), d);
      }}
    />
  );
});

/** Campo de CPF com máscara XXX.XXX.XXX-XX e no máximo 11 dígitos. */
export const InputCPF = forwardRef<HTMLInputElement, Base>(function InputCPF(
  { value, onChange, ...rest },
  ref,
) {
  return (
    <Input
      ref={ref}
      inputMode="numeric"
      maxLength={14}
      placeholder="000.000.000-00"
      {...rest}
      value={mascaraCPF(value ?? "")}
      onKeyDown={(e) => {
        bloquearNaoNumerico(e);
        rest.onKeyDown?.(e);
      }}
      onPaste={(e) => {
        e.preventDefault();
        const texto = e.clipboardData.getData("text");
        const d = limparCPF(`${value ?? ""}${texto}`).slice(0, 11);
        onChange(mascaraCPF(d), d);
      }}
      onChange={(e) => {
        const d = limparCPF(e.target.value).slice(0, 11);
        onChange(mascaraCPF(d), d);
      }}
    />
  );
});
