import { forwardRef, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
type Props = Omit<NativeInputProps, "type"> & {
  /** Oculta o botão de calendário quando `false` (padrão: true). */
  showCalendar?: boolean;
};

export const DateInputBR = forwardRef<HTMLInputElement, Props>(function DateInputBR(
  { value, onChange, onBlur, placeholder = "dd/mm/aaaa", inputMode = "numeric", maxLength = 10, showCalendar = true, className, disabled, ...rest },
  ref,
) {
  const external = typeof value === "string" ? value : "";
  const [text, setText] = useState<string>(() => isoToBr(external));
  const [open, setOpen] = useState(false);
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

  function emitChange(iso: string) {
    if (!onChange) return;
    const synthetic = {
      target: { value: iso, name: (rest as { name?: string }).name ?? "" },
      currentTarget: { value: iso },
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    onChange(synthetic);
  }

  // Data selecionada em objeto Date (para o Calendar). Usa noon-local para evitar
  // deslocamento de fuso ao converter ida-e-volta.
  const currentIso = brToIso(text) || external;
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(currentIso)
    ? new Date(`${currentIso}T12:00:00`)
    : undefined;

  const inputEl = (
    <Input
      ref={setRefs}
      type="text"
      inputMode={inputMode}
      placeholder={placeholder}
      value={text}
      maxLength={maxLength}
      disabled={disabled}
      className={cn(showCalendar ? "pr-9" : "", className)}
      onChange={(e) => {
        const masked = applyMask(e.target.value);
        setText(masked);
        emitChange(brToIso(masked));
      }}
      onBlur={(e) => {
        if (onBlur) {
          const iso = brToIso(text);
          const synthetic = {
            ...e,
            target: { ...e.target, value: iso },
            currentTarget: { ...e.currentTarget, value: iso },
          } as unknown as React.FocusEvent<HTMLInputElement>;
          onBlur(synthetic);
        }
      }}
      {...rest}
    />
  );

  if (!showCalendar) return inputEl;

  return (
    <div className="relative inline-flex w-full">
      {inputEl}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label="Abrir calendário"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={selectedDate}
            defaultMonth={selectedDate}
            onSelect={(d) => {
              if (!d) return;
              const yyyy = d.getFullYear();
              const mm = String(d.getMonth() + 1).padStart(2, "0");
              const dd = String(d.getDate()).padStart(2, "0");
              const iso = `${yyyy}-${mm}-${dd}`;
              setText(isoToBr(iso));
              emitChange(iso);
              setOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
});
