import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import type { ComponentPropsWithoutRef } from "react";

type BaseProps = Omit<ComponentPropsWithoutRef<typeof Input>, "value" | "onChange" | "type">;

interface Props extends BaseProps {
  /** Numeric string in BRL units, e.g. "130.00" or "" */
  value: string;
  onChange: (value: string) => void;
}

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function valueToCents(v: string): number {
  if (!v) return 0;
  const n = Number(v);
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

export const CurrencyInput = forwardRef<HTMLInputElement, Props>(function CurrencyInput(
  { value, onChange, placeholder = "0,00", ...rest },
  ref,
) {
  const cents = valueToCents(value);
  const display = value === "" ? "" : `R$ ${formatBRL(cents)}`;

  return (
    <Input
      ref={ref}
      inputMode="numeric"
      value={display}
      placeholder={`R$ ${placeholder}`}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "");
        if (!digits) {
          onChange("");
          return;
        }
        const c = parseInt(digits, 10);
        onChange((c / 100).toFixed(2));
      }}
      {...rest}
    />
  );
});
