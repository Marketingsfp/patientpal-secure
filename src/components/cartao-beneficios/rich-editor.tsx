import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontFamily } from "@tiptap/extension-font-family";
import { TextAlign } from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { Image } from "@tiptap/extension-image";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Heading1, Heading2, Heading3,
  Undo2, Redo2, Image as ImageIcon, Link as LinkIcon,
  Table as TableIcon, Rows3, Columns3, Trash2,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Extend table cells with a backgroundColor attribute so users can paint cells/rows/columns.
const ColoredTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute("data-bg") ||
          (el as HTMLElement).style.backgroundColor ||
          null,
        renderHTML: (attrs) => {
          if (!attrs.backgroundColor) return {};
          return {
            "data-bg": attrs.backgroundColor,
            style: `background-color: ${attrs.backgroundColor}`,
          };
        },
      },
    };
  },
});
const ColoredTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute("data-bg") ||
          (el as HTMLElement).style.backgroundColor ||
          null,
        renderHTML: (attrs) => {
          if (!attrs.backgroundColor) return {};
          return {
            "data-bg": attrs.backgroundColor,
            style: `background-color: ${attrs.backgroundColor}`,
          };
        },
      },
    };
  },
});

const FONTS = [
  "Arial", "Calibri", "Times New Roman", "Georgia", "Verdana",
  "Tahoma", "Courier New", "Helvetica", "Garamond", "Trebuchet MS",
];
const SIZES = ["10px", "12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "40px"];

function ToolbarButton({
  active, onClick, title, children, disabled,
}: {
  active?: boolean; onClick: () => void; title: string;
  children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`h-8 w-8 inline-flex items-center justify-center rounded text-sm transition-colors
        ${active ? "bg-primary/15 text-primary" : "hover:bg-muted"}
        disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

interface Props {
  value: string;
  onChange: (html: string) => void;
  clinicaId: string;
  variables?: { label: string; token: string }[];
}

export function RichEditor({ value, onChange, clinicaId, variables }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  // Margens da página em mm (A4: 210 × 297). Persistidas em localStorage por clínica.
  const storageKey = `rt-margins:${clinicaId || "default"}`;
  const readStored = () => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as { t: number; b: number; l: number; r: number; s: boolean }) : null;
    } catch { return null; }
  };
  const stored = readStored();
  const [marginTop, setMarginTop] = useState(stored?.t ?? 12);
  const [marginBottom, setMarginBottom] = useState(stored?.b ?? 12);
  const [marginLeft, setMarginLeft] = useState(stored?.l ?? 14);
  const [marginRight, setMarginRight] = useState(stored?.r ?? 14);
  const [showRuler, setShowRuler] = useState(stored?.s ?? true);
  const pageWidthMm = 210;

  // Persiste margens sempre que mudarem
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ t: marginTop, b: marginBottom, l: marginLeft, r: marginRight, s: showRuler }),
      );
    } catch { /* ignore */ }
  }, [storageKey, marginTop, marginBottom, marginLeft, marginRight, showRuler]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      FontFamily.configure({ types: ["textStyle"] }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true, HTMLAttributes: { class: "rt-table" } }),
      TableRow, ColoredTableHeader, ColoredTableCell,
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content: value || "<p></p>",
    editorProps: {
      attributes: {
        class:
          "rt-editor prose prose-sm max-w-none focus:outline-none min-h-[60vh]",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Sync external value updates (when switching convênios)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5 MB).");
      return;
    }
    const ext = file.name.split(".").pop() || "png";
    const path = `${clinicaId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("cb-informativos").upload(path, file, {
      cacheControl: "3600", upsert: false,
    });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("cb-informativos").getPublicUrl(path);
    editor.chain().focus().setImage({ src: data.publicUrl }).run();
  };

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL do link:", prev || "https://");
    if (url === null) return;
    if (url === "") { (editor.chain().focus() as any).unsetLink?.().run(); return; }
    (editor.chain().focus() as any).setLink?.({ href: url, target: "_blank" }).run();
  };

  const setColor = (e: React.ChangeEvent<HTMLInputElement>) => {
    editor.chain().focus().setColor(e.target.value).run();
  };

  return (
    <div className="rt-shell border rounded-md overflow-hidden bg-background">
      <div className="flex flex-wrap items-center gap-1 border-b p-1.5 bg-muted/30 print:hidden">
        <ToolbarButton title="Desfazer" onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Refazer" onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>
        <div className="w-px h-6 bg-border mx-1" />

        <Select
          value={(editor.getAttributes("textStyle").fontFamily as string) || ""}
          onValueChange={(v) => editor.chain().focus().setFontFamily(v).run()}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Fonte" /></SelectTrigger>
          <SelectContent>
            {FONTS.map((f) => <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select
          value={(editor.getAttributes("textStyle").fontSize as string) || ""}
          onValueChange={(v) => {
            // FontSize isn't built-in; emulate via inline style mark
            (editor.chain().focus() as any).setMark("textStyle", { fontSize: v }).run();
          }}
        >
          <SelectTrigger className="h-8 w-[90px] text-xs"><SelectValue placeholder="Tam." /></SelectTrigger>
          <SelectContent>
            {SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="w-px h-6 bg-border mx-1" />
        <ToolbarButton title="Negrito" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Itálico" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Sublinhado" active={editor.isActive("underline")} onClick={() => (editor.chain().focus() as any).toggleUnderline?.().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Tachado" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>

        <label
          className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-muted cursor-pointer relative"
          title="Cor da fonte"
        >
          <span className="text-xs font-bold">A</span>
          <span
            className="absolute bottom-1 left-1.5 right-1.5 h-1 rounded-sm"
            style={{ background: (editor.getAttributes("textStyle").color as string) || "#000000" }}
          />
          <input
            type="color"
            className="absolute inset-0 opacity-0 cursor-pointer"
            value={(editor.getAttributes("textStyle").color as string) || "#000000"}
            onChange={setColor}
          />
        </label>

        <div className="w-px h-6 bg-border mx-1" />
        <ToolbarButton title="Alinhar à esquerda" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Centralizar" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Alinhar à direita" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Justificar" active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
          <AlignJustify className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />
        <ToolbarButton title="Título 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Título 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Título 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Lista" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Lista numerada" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />
        <ToolbarButton title="Inserir tabela 3×3" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <TableIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Adicionar linha" onClick={() => editor.chain().focus().addRowAfter().run()} disabled={!editor.can().addRowAfter()}>
          <Rows3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Adicionar coluna" onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={!editor.can().addColumnAfter()}>
          <Columns3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Excluir linha" onClick={() => editor.chain().focus().deleteRow().run()} disabled={!editor.can().deleteRow()}>
          <span className="text-[10px] font-bold">−L</span>
        </ToolbarButton>
        <ToolbarButton title="Excluir coluna" onClick={() => editor.chain().focus().deleteColumn().run()} disabled={!editor.can().deleteColumn()}>
          <span className="text-[10px] font-bold">−C</span>
        </ToolbarButton>
        <ToolbarButton title="Excluir tabela" onClick={() => editor.chain().focus().deleteTable().run()} disabled={!editor.can().deleteTable()}>
          <Trash2 className="h-4 w-4" />
        </ToolbarButton>
        <label
          className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-muted cursor-pointer relative"
          title="Cor de fundo da célula (selecione células para pintar linha/coluna)"
        >
          <TableIcon className="h-4 w-4" />
          <span
            className="absolute bottom-1 left-1.5 right-1.5 h-1 rounded-sm border border-border"
            style={{ background: (editor.getAttributes("tableCell").backgroundColor as string) || (editor.getAttributes("tableHeader").backgroundColor as string) || "#ffffff" }}
          />
          <input
            type="color"
            className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
            disabled={!editor.can().setCellAttribute("backgroundColor", "#ffffff")}
            onChange={(e) => editor.chain().focus().setCellAttribute("backgroundColor", e.target.value).run()}
          />
        </label>
        <ToolbarButton
          title="Remover cor da célula"
          onClick={() => editor.chain().focus().setCellAttribute("backgroundColor", null).run()}
          disabled={!editor.can().setCellAttribute("backgroundColor", null)}
        >
          <span className="text-[10px] font-bold">⌫</span>
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />
        <ToolbarButton title="Inserir imagem" onClick={() => fileRef.current?.click()}>
          <ImageIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Link" active={editor.isActive("link")} onClick={setLink}>
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <input
          ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = "";
          }}
        />
        <div className="ml-auto" />
        {variables && variables.length > 0 && (
          <Select
            value=""
            onValueChange={(token) => {
              if (!token) return;
              editor.chain().focus().insertContent(`{{${token}}}`).run();
            }}
          >
            <SelectTrigger className="h-8 w-[170px] text-xs" title="Inserir variável">
              <SelectValue placeholder="Inserir variável" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {variables.map((v) => (
                <SelectItem key={v.token} value={v.token}>
                  <span className="flex flex-col">
                    <span className="text-xs">{v.label}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{`{{${v.token}}}`}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          type="button" variant="ghost" size="sm" className="h-8"
          onClick={() => editor.commands.setContent("<p></p>")}
        >
          Limpar
        </Button>
      </div>

      <div className="rt-scroll bg-muted/40 overflow-auto" style={{ maxHeight: "70vh" }}>
        <div className="mx-auto my-4" style={{ width: "210mm" }}>
          {showRuler && (
            <HorizontalRuler
              widthMm={pageWidthMm}
              marginLeft={marginLeft}
              marginRight={marginRight}
              onChangeLeft={(v) => setMarginLeft(Math.max(0, Math.min(pageWidthMm - marginRight - 20, v)))}
              onChangeRight={(v) => setMarginRight(Math.max(0, Math.min(pageWidthMm - marginLeft - 20, v)))}
            />
          )}
          <div
            className="rt-page bg-white shadow-md"
            style={{
              width: "210mm",
              minHeight: "297mm",
              paddingTop: `${marginTop}mm`,
              paddingBottom: `${marginBottom}mm`,
              paddingLeft: `${marginLeft}mm`,
              paddingRight: `${marginRight}mm`,
            }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {/* Barra de margens */}
      <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2 bg-muted/30 text-xs print:hidden">
        <button
          type="button"
          onClick={() => setShowRuler((s) => !s)}
          className="px-2 py-1 rounded hover:bg-muted"
          title="Mostrar/ocultar régua"
        >
          {showRuler ? "Ocultar régua" : "Mostrar régua"}
        </button>
        <div className="w-px h-5 bg-border" />
        <span className="font-medium text-muted-foreground">Margens (mm):</span>
        <MarginInput label="Sup" value={marginTop} onChange={setMarginTop} />
        <MarginInput label="Inf" value={marginBottom} onChange={setMarginBottom} />
        <MarginInput label="Esq" value={marginLeft} onChange={setMarginLeft} />
        <MarginInput label="Dir" value={marginRight} onChange={setMarginRight} />
        <button
          type="button"
          onClick={() => { setMarginTop(12); setMarginBottom(12); setMarginLeft(14); setMarginRight(14); }}
          className="px-2 py-1 rounded hover:bg-muted ml-auto"
        >
          Restaurar padrão
        </button>
      </div>
    </div>
  );
}

function MarginInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="inline-flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.max(0, Math.min(100, n)));
        }}
        className="h-7 w-14 rounded border border-border bg-background px-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}

// Régua horizontal estilo Word: marcações em cm + alças arrastáveis para margem esq./dir.
function HorizontalRuler({
  widthMm, marginLeft, marginRight, onChangeLeft, onChangeRight,
}: {
  widthMm: number;
  marginLeft: number;
  marginRight: number;
  onChangeLeft: (mm: number) => void;
  onChangeRight: (mm: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const totalCm = Math.floor(widthMm / 10);

  const startDrag = (which: "left" | "right") => (e: React.PointerEvent) => {
    e.preventDefault();
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pxPerMm = rect.width / widthMm;
    const move = (ev: PointerEvent) => {
      const xMm = (ev.clientX - rect.left) / pxPerMm;
      if (which === "left") onChangeLeft(Math.round(xMm));
      else onChangeRight(Math.round(widthMm - xMm));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const leftPct = (marginLeft / widthMm) * 100;
  const rightPct = ((widthMm - marginRight) / widthMm) * 100;

  return (
    <div
      ref={ref}
      className="relative h-6 mb-1 select-none print:hidden"
      style={{ width: "210mm" }}
    >
      {/* faixa de fundo: margens (cinza) + área editável (branca) */}
      <div className="absolute inset-y-0 left-0 right-0 rounded-sm bg-muted-foreground/30" />
      <div
        className="absolute inset-y-0 bg-background border-x border-border"
        style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
      />
      {/* marcações em cm */}
      {Array.from({ length: totalCm + 1 }).map((_, cm) => {
        const pct = (cm * 10 / widthMm) * 100;
        const inMargin = cm * 10 < marginLeft || cm * 10 > widthMm - marginRight;
        return (
          <div
            key={cm}
            className="absolute top-0 bottom-0 flex flex-col items-center"
            style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
          >
            <span
              className={`text-[9px] leading-none mt-0.5 ${inMargin ? "text-background/90" : "text-muted-foreground"}`}
            >
              {cm}
            </span>
            <span className={`w-px flex-1 mt-0.5 ${inMargin ? "bg-background/60" : "bg-muted-foreground/50"}`} />
          </div>
        );
      })}
      {/* alça margem esquerda */}
      <div
        onPointerDown={startDrag("left")}
        title={`Margem esquerda: ${marginLeft} mm`}
        className="absolute top-0 bottom-0 w-3 cursor-ew-resize z-10"
        style={{ left: `calc(${leftPct}% - 6px)` }}
      >
        <div className="mx-auto w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-primary" />
      </div>
      {/* alça margem direita */}
      <div
        onPointerDown={startDrag("right")}
        title={`Margem direita: ${marginRight} mm`}
        className="absolute top-0 bottom-0 w-3 cursor-ew-resize z-10"
        style={{ left: `calc(${rightPct}% - 6px)` }}
      >
        <div className="mx-auto w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-primary" />
      </div>
    </div>
  );
}