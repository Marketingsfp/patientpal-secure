import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OdontogramaArcada } from "./odontograma-arcada";

// FDI: mesmas fileiras usadas em <Odontograma />
const SUP_DIR = [18, 17, 16, 15, 14, 13, 12, 11];
const SUP_ESQ = [21, 22, 23, 24, 25, 26, 27, 28];
const INF_ESQ = [31, 32, 33, 34, 35, 36, 37, 38];
const INF_DIR = [48, 47, 46, 45, 44, 43, 42, 41];

interface Props {
  value: number[];
  onChange: (v: number[]) => void;
  disabled?: boolean;
  /** Se true, mostra o mini-odontograma sempre aberto (uso em card/edição). */
  inline?: boolean;
  /** Usa a grade antiga de quadrados em vez da arcada anatômica. */
  grade?: boolean;
}

/**
 * Seletor visual de dentes (FDI) usado no Novo Orçamento Odontológico.
 * Múltipla seleção: clicar alterna. Renderiza em Popover por padrão para
 * caber dentro de linhas de item de orçamento.
 */
export function DentePicker({ value, onChange, disabled, inline, grade }: Props) {
  const selected = useMemo(() => new Set(value ?? []), [value]);
  const [open, setOpen] = useState(false);

  const toggle = (d: number) => {
    const next = new Set(selected);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    onChange(Array.from(next).sort((a, b) => a - b));
  };
  const limpar = () => onChange([]);

  const arcada = <OdontogramaArcada value={value} onChange={onChange} disabled={disabled} />;

  const gradeQuadrados = (
    <div className="flex flex-col gap-2 select-none">
      {[[...SUP_DIR, ...SUP_ESQ], [...INF_DIR, ...INF_ESQ]].map((linha, idx) => (
        <div key={idx} className="flex justify-center gap-1 flex-wrap">
          {linha.map((d) => {
            const on = selected.has(d);
            return (
              <button
                key={d}
                type="button"
                disabled={disabled}
                onClick={() => toggle(d)}
                className={`h-9 w-8 rounded-md border-2 text-[11px] font-mono transition ${
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/40 text-foreground/70"
                }`}
                aria-pressed={on}
                title={`Dente ${d}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      ))}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
        <span>{selected.size === 0 ? "Nenhum dente selecionado" : `${selected.size} dente(s)`}</span>
        {!disabled && selected.size > 0 && (
          <button type="button" onClick={limpar} className="text-primary hover:underline">
            Limpar
          </button>
        )}
      </div>
    </div>
  );

  const conteudo = grade ? gradeQuadrados : arcada;

  if (inline) return conteudo;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-8 gap-2 whitespace-nowrap"
        >
          {value.length === 0 ? (
            <span className="text-muted-foreground">Dentes…</span>
          ) : (
            <>
              <span>Dentes</span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {value.length}
              </Badge>
              <span className="text-xs text-muted-foreground truncate max-w-[9rem]">
                {value.slice(0, 4).join(", ")}
                {value.length > 4 ? "…" : ""}
              </span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[460px] max-w-[92vw] p-3" align="start">
        {conteudo}
      </PopoverContent>
    </Popover>
  );
}