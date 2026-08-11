import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { Table as TableIcon, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const MAX_ROWS = 8;
const MAX_COLS = 10;

export function TableInsertMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [withHeader, setWithHeader] = useState(true);

  const inserir = (r: number, c: number) => {
    editor.chain().focus().insertTable({ rows: r, cols: c, withHeaderRow: withHeader }).run();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Inserir tabela"
          className="h-8 px-1.5 inline-flex items-center gap-0.5 rounded hover:bg-muted"
        >
          <TableIcon className="h-4 w-4" />
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3 space-y-3">
        <div className="text-xs font-medium text-muted-foreground">
          {hover.r > 0 ? `${hover.r} × ${hover.c}` : "Selecione o tamanho"}
        </div>
        <div
          className="grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${MAX_COLS}, 16px)` }}
          onMouseLeave={() => setHover({ r: 0, c: 0 })}
        >
          {Array.from({ length: MAX_ROWS * MAX_COLS }).map((_, i) => {
            const r = Math.floor(i / MAX_COLS) + 1;
            const c = (i % MAX_COLS) + 1;
            const on = r <= hover.r && c <= hover.c;
            return (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHover({ r, c })}
                onClick={() => inserir(r, c)}
                className={`h-4 w-4 rounded-[2px] border ${on ? "bg-primary border-primary" : "bg-background border-border"}`}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-2 pt-1 border-t">
          <input
            type="number"
            min={1}
            max={50}
            value={rows}
            onChange={(e) => setRows(Math.max(1, Number(e.target.value) || 1))}
            className="h-8 w-14 rounded border bg-background px-2 text-xs"
            aria-label="Linhas"
          />
          <span className="text-xs text-muted-foreground">×</span>
          <input
            type="number"
            min={1}
            max={20}
            value={cols}
            onChange={(e) => setCols(Math.max(1, Number(e.target.value) || 1))}
            className="h-8 w-14 rounded border bg-background px-2 text-xs"
            aria-label="Colunas"
          />
          <Button size="sm" className="h-8 text-xs" onClick={() => inserir(rows, cols)}>
            Inserir
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={withHeader} onChange={(e) => setWithHeader(e.target.checked)} />
          Com linha de cabeçalho
        </label>
      </PopoverContent>
    </Popover>
  );
}
