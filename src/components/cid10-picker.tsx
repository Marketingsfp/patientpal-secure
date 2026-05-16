import { useMemo, useState } from "react";
import { Search, Plus, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { buscarCid10, type Cid10 } from "@/data/cid10";

interface Props {
  /** chamado com o texto a anexar, ex.: "[CID J00 — Nasofaringite aguda]" */
  onPick: (texto: string, item: Cid10) => void;
  size?: "sm" | "default";
}

export function Cid10Picker({ onPick, size = "sm" }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const resultados = useMemo(() => buscarCid10(q, 80), [q]);

  const handlePick = (c: Cid10) => {
    onPick(`[CID ${c.codigo} — ${c.descricao}]`, c);
    setOpen(false);
    setQ("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size={size === "sm" ? "sm" : "default"} className="gap-1">
          <Stethoscope className="h-3.5 w-3.5" />
          CID-10
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="end">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar por código ou descrição (ex.: J00, hipertensão, ansiedade)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {resultados.length} resultado(s) — clique para inserir no campo
          </p>
        </div>
        <div className="max-h-80 overflow-auto">
          {resultados.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Nenhum CID encontrado.
            </div>
          ) : resultados.map((c) => (
            <button
              key={c.codigo}
              type="button"
              onClick={() => handlePick(c)}
              className="w-full text-left px-3 py-2 hover:bg-muted/60 border-b border-border/50 last:border-0 flex items-start gap-2 group"
            >
              <Badge variant="secondary" className="font-mono text-xs shrink-0 mt-0.5">
                {c.codigo}
              </Badge>
              <span className="text-sm flex-1">{c.descricao}</span>
              <Plus className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
