import { Delete } from "lucide-react";

/**
 * Teclado numérico touch para o totem (CPF etc.). O input correspondente deve
 * ser readOnly + inputMode="none" para o teclado do sistema operacional não
 * abrir por cima — toda a digitação entra por aqui.
 */
export function TecladoNumerico({
  onDigit,
  onBackspace,
  onClear,
  disabled,
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const base =
    "h-16 rounded-xl border-2 text-2xl font-semibold bg-background transition active:scale-95 disabled:opacity-40 hover:border-primary hover:bg-primary/5";
  return (
    <div className="grid grid-cols-3 gap-2.5 max-w-sm mx-auto select-none">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button key={d} type="button" className={base} disabled={disabled} onClick={() => onDigit(d)}>
          {d}
        </button>
      ))}
      <button type="button" className={`${base} text-lg text-muted-foreground`} disabled={disabled} onClick={onClear}>
        Limpar
      </button>
      <button type="button" className={base} disabled={disabled} onClick={() => onDigit("0")}>
        0
      </button>
      <button
        type="button"
        className={`${base} flex items-center justify-center`}
        disabled={disabled}
        onClick={onBackspace}
        aria-label="Apagar"
      >
        <Delete className="h-7 w-7" />
      </button>
    </div>
  );
}

/** Formata 11 dígitos como CPF (000.000.000-00) conforme vai sendo digitado. */
export function formatarCpfParcial(digitos: string): string {
  const d = digitos.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
