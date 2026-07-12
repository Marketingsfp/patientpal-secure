import { forwardRef, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

// Converte "yyyy-mm-dd" -> "dd/mm/yyyy". Retorna "" quando entrada não é ISO.
function isoToBr(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Converte "dd/mm/yyyy" -> "yyyy-mm-dd". Retorna "" quando incompleto/inválido.
function brToIso(br: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  if (!m) return "";
  const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Aplica máscara dd/mm/yyyy incrementalmente enquanto o usuário digita.
function applyMask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

type NativeInputProps = React.ComponentProps<typeof Input>;

/**
 * DateInputBR — input mascarado dd/mm/aaaa.
 *
 * **Contrato idêntico ao <input type="date">**: recebe/emite string ISO
 * `yyyy-mm-dd` via `value` e `onChange` (o `e.target.value` do evento é
 * o valor ISO), mas exibe dd/mm/aaaa independentemente do locale do navegador.
 *
 * A substituição de `<Input type="date" .../>` por `<DateInputBR .../>` é
 * puramente lexical — todo `onChange={(e) => X(e.target.value)}` continua
 * funcionando sem modificação.
 */
type Props = Omit<NativeInputProps, "type">;

export const DateInputBR = forwardRef<HTMLInputElement, Props>(function DateInputBR(
  { value, onChange, placeholder = "dd/mm/aaaa", inputMode = "numeric", maxLength = 10, ...rest },
  ref,
) {
  const external = typeof value === "string" ? value : "";
  const [text, setText] = useState<string>(() => isoToBr(external));
  const innerRef = useRef<HTMLInputElement | null>(null);

  // Sincroniza quando o valor externo muda (reset de filtro, load async, etc.).
  useEffect(() => {
    setText(isoToBr(external));
  }, [external]);

  function setRefs(node: HTMLInputElement | null) {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
  }

  return (
    <Input
      ref={setRefs}
      type="text"
      inputMode={inputMode}
      placeholder={placeholder}
      value={text}
      maxLength={maxLength}
      onChange={(e) => {
        const masked = applyMask(e.target.value);
        setText(masked);
        if (onChange) {
          // Constrói um evento sintético cujo target.value é o ISO yyyy-mm-dd,
          // mantendo compatibilidade com o contrato do <input type="date">.
          const iso = brToIso(masked);
          const synthetic = {
            ...e,
            target: { ...e.target, value: iso },
            currentTarget: { ...e.currentTarget, value: iso },
          } as unknown as React.ChangeEvent<HTMLInputElement>;
          onChange(synthetic);
        }
      }}
      {...rest}
    />
  );
});
