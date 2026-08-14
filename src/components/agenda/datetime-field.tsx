import * as React from "react";
import { Input } from "@/components/ui/input";

/** "YYYY-MM-DDTHH:mm" -> "DD/MM/AAAA HH:MM" */
function isoToMask(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

/** "DD/MM/AAAA HH:MM" -> "YYYY-MM-DDTHH:mm" (vazio se incompleto/inválido) */
function maskToIso(mask: string): string {
  const d = mask.replace(/\D/g, "");
  if (d.length < 12) return "";
  const dia = d.slice(0, 2),
    mes = d.slice(2, 4),
    ano = d.slice(4, 8);
  const hh = d.slice(8, 10),
    mm = d.slice(10, 12);
  const nd = Number(dia),
    nm = Number(mes),
    nh = Number(hh),
    nmin = Number(mm);
  if (nd < 1 || nd > 31 || nm < 1 || nm > 12 || nh > 23 || nmin > 59) return "";
  return `${ano}-${mes}-${dia}T${hh}:${mm}`;
}

function formatMask(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 12);
  let out = d.slice(0, 2);
  if (d.length > 2) out += "/" + d.slice(2, 4);
  if (d.length > 4) out += "/" + d.slice(4, 8);
  if (d.length > 8) out += " " + d.slice(8, 10);
  if (d.length > 10) out += ":" + d.slice(10, 12);
  return out;
}

type Props = {
  value: string;
  onChange: (isoLocal: string) => void;
  required?: boolean;
  className?: string;
  id?: string;
};

/**
 * Mobile: campo de texto com máscara DD/MM/AAAA HH:MM (sem popover de calendário).
 * Desktop: input nativo datetime-local com o seletor completo.
 */
export function DateTimeField({ value, onChange, required, className, id }: Props) {
  const [text, setText] = React.useState(() => isoToMask(value));

  React.useEffect(() => {
    const next = isoToMask(value);
    if (maskToIso(text) !== value) setText(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <>
      {/* Mobile — máscara numérica, nunca abre calendário */}
      <Input
        id={id ? `${id}-mobile` : undefined}
        className={`sm:hidden ${className ?? ""}`}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD/MM/AAAA HH:MM"
        value={text}
        onChange={(e) => {
          const masked = formatMask(e.target.value);
          setText(masked);
          const iso = maskToIso(masked);
          if (iso) onChange(iso);
        }}
        required={required}
      />
      {/* Desktop — seletor nativo completo */}
      <Input
        id={id}
        className={`hidden sm:block ${className ?? ""}`}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </>
  );
}
