import { useMemo, useRef, useState } from "react";
import { Search, Stethoscope, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buscarCid10, type Cid10 } from "@/data/cid10";

interface Props {
  /** CIDs já selecionados (código). */
  selecionados?: Cid10[];
  onAdd: (item: Cid10) => void;
  onRemove?: (codigo: string) => void;
  placeholder?: string;
}

/** Busca instantânea de CID-10 com dropdown de autocomplete. */
export function Cid10Autocomplete({ selecionados = [], onAdd, onRemove, placeholder }: Props) {
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);
  const [idx, setIdx] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resultados = useMemo(() => (q.trim() ? buscarCid10(q, 12) : []), [q]);

  const escolher = (c: Cid10) => {
    onAdd(c);
    setQ("");
    setAberto(false);
    setIdx(0);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setAberto(true); setIdx(0); }}
          onFocus={() => setAberto(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setAberto(false), 120); }}
          onKeyDown={(e) => {
            if (!resultados.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, resultados.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); escolher(resultados[idx]); }
            else if (e.key === "Escape") setAberto(false);
          }}
          className="pl-8 h-9"
          placeholder={placeholder ?? "Buscar CID-10 por código ou doença (ex.: J00, hipertensão)…"}
        />
        {aberto && resultados.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-72 overflow-auto">
            {resultados.map((c, i) => (
              <button
                key={c.codigo}
                type="button"
                onMouseDown={() => { if (blurTimer.current) clearTimeout(blurTimer.current); }}
                onClick={() => escolher(c)}
                onMouseEnter={() => setIdx(i)}
                className={`w-full text-left px-3 py-2 flex items-start gap-2 border-b border-border/50 last:border-0 ${i === idx ? "bg-muted" : "hover:bg-muted/60"}`}
              >
                <Badge variant="secondary" className="font-mono text-[11px] shrink-0 mt-0.5">{c.codigo}</Badge>
                <span className="text-sm flex-1">{c.descricao}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selecionados.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selecionados.map((c) => (
            <Badge key={c.codigo} variant="outline" className="gap-1 pr-1">
              <Stethoscope className="h-3 w-3 text-primary" />
              <span className="font-mono text-[11px]">{c.codigo}</span>
              <span className="max-w-[220px] truncate">{c.descricao}</span>
              {onRemove && (
                <button type="button" onClick={() => onRemove(c.codigo)} className="ml-0.5 rounded p-0.5 hover:bg-destructive/15" title="Remover">
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
