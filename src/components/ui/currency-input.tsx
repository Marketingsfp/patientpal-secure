import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import type { ComponentPropsWithoutRef } from "react";
import { proximoValorMoeda, valorEmCentavos } from "@/lib/moeda-mascara";

type BaseProps = Omit<ComponentPropsWithoutRef<typeof Input>, "value" | "onChange" | "type">;

interface Props extends BaseProps {
  /** Numeric string in BRL units, e.g. "130.00" or "" */
  value: string;
  onChange: (value: string) => void;
  /**
   * Texto mostrado com o campo vazio. Vem completo, sem "R$" automático: onde
   * vazio não significa zero (ex.: repasse em branco = usa o padrão do médico),
   * o campo precisa dizer "padrão" em vez de sugerir R$ 0,00.
   */
  placeholder?: string;
}

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CurrencyInput = forwardRef<HTMLInputElement, Props>(function CurrencyInput(
  { value, onChange, placeholder = "R$ 0,00", ...rest },
  ref,
) {
  const display = value === "" ? "" : `R$ ${formatBRL(valorEmCentavos(value))}`;

  return (
    <Input
      ref={ref}
      inputMode="numeric"
      value={display}
      placeholder={placeholder}
      onChange={(e) => onChange(proximoValorMoeda(value, e.target.value))}
      {...rest}
    />
  );
});
