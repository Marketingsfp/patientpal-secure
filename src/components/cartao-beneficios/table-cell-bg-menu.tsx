import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { PaintBucket, ChevronDown, Ban } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const PALETA: { nome: string; cores: string[] }[] = [
  {
    nome: "Neutros",
    cores: ["#ffffff", "#f5f5f5", "#e5e7eb", "#d1d5db", "#9ca3af", "#4b5563", "#1f2937", "#000000"],
  },
  {
    nome: "Corporativo",
    cores: ["#1b365d", "#274b78", "#3b6ea5", "#8fb3d9", "#dce7f3", "#0f766e", "#14b8a6", "#ccfbf1"],
  },
  {
    nome: "Destaques",
    cores: ["#fef3c7", "#fde68a", "#fca5a5", "#fee2e2", "#dcfce7", "#bbf7d0", "#e9d5ff", "#fbcfe8"],
  },
];

export function TableCellBgMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);

  const atual =
    (editor.getAttributes("tableCell").backgroundColor as string) ||
    (editor.getAttributes("tableHeader").backgroundColor as string) ||
    "";

  const podePintar = editor.can().setCellAttribute("backgroundColor", "#ffffff");

  const aplicar = (cor: string | null) => {
    editor.chain().focus().setCellAttribute("backgroundColor", cor).run();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Cor de fundo da célula (selecione células para pintar linha/coluna)"
          disabled={!podePintar}
          className="h-8 px-1.5 inline-flex items-center gap-0.5 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed relative"
        >
          <PaintBucket className="h-4 w-4" />
          <span
            className="absolute bottom-0.5 left-1 right-3 h-1 rounded-sm border border-border"
            style={{ background: atual || "transparent" }}
          />
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3 space-y-3">
        {PALETA.map((grupo) => (
          <div key={grupo.nome} className="space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">{grupo.nome}</div>
            <div className="flex gap-1">
              {grupo.cores.map((cor) => (
                <button
                  key={cor}
                  type="button"
                  title={cor}
                  onClick={() => aplicar(cor)}
                  className={`h-5 w-5 rounded-[3px] border ${atual.toLowerCase() === cor ? "ring-2 ring-primary" : "border-border"}`}
                  style={{ background: cor }}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-2 border-t">
          <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="color"
              value={atual || "#ffffff"}
              onChange={(e) =>
                editor.chain().focus().setCellAttribute("backgroundColor", e.target.value).run()
              }
              className="h-7 w-9 cursor-pointer rounded border bg-background p-0.5"
              aria-label="Cor personalizada"
            />
            Personalizada
          </label>
          <button
            type="button"
            onClick={() => aplicar(null)}
            className="ml-auto inline-flex items-center gap-1 h-7 px-2 rounded border text-xs hover:bg-muted"
          >
            <Ban className="h-3 w-3" />
            Remover
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
