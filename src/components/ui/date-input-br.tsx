import { forwardRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

// Converte "yyyy-mm-dd" -> "dd/mm/yyyy" (aceita string vazia).
function isoToBr(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Converte "dd/mm/yyyy" -> "yyyy-mm-dd" (retorna "" se incompleto/invalido).
function brToIso(br: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  if (!m) return "";
  const [_, d, mo, y] = m;
  const day = Number(d), month = Number(mo), year = Number(y);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return "";
  return `${y}-${mo}-${d}`;
}

// Aplica máscara dd/mm/yyyy incremental enquanto o usuário digita.
function applyMask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

interface Props extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  /** valor ISO yyyy-mm-dd (mesmo contrato do <input type="date">) */
  value: string;
  /** recebe o valor ISO yyyy-mm-dd; string vazia quando incompleto */
  onChange: (isoValue: string) => void;
}

/**
 * DateInputBR — input mascarado dd/mm/yyyy.
 *
 * Contrato idêntico ao <input type="date"> nativo: recebe/emite "yyyy-mm-dd",
 * mas exibe dd/mm/yyyy independentemente do locale do navegador.
 */
export const DateInputBR = forwardRef<HTMLInputElement, Props>(function DateInputBR(
  { value, onChange, placeholder = "dd/mm/aaaa", inputMode = "numeric", ...rest },
  ref,
) {
  const [text, setText] = useState<string>(() => isoToBr(value));

  // Sincroniza quando o valor externo muda (ex.: reset de filtro).
  useEffect(() => {
    setText(isoToBr(value));
  }, [value]);

  return (
    <Input
      ref={ref}
      type="text"
      inputMode={inputMode}
      placeholder={placeholder}
      value={text}
      maxLength={10}
      onChange={(e) => {
        const masked = applyMask(e.target.value);
        setText(masked);
        onChange(brToIso(masked));
      }}
      {...rest}
    />
  );
});
