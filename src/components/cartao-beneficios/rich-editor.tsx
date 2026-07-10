import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
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
import { NodeSelection } from "@tiptap/pm/state";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Undo2,
  Redo2,
  Image as ImageIcon,
  Link as LinkIcon,
  Table as TableIcon,
  Rows3,
  Columns3,
  Trash2,
  Crop,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageCropDialog } from "./image-crop-dialog";

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
      verticalAlign: {
        default: null,
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute("data-valign") ||
          (el as HTMLElement).style.verticalAlign ||
          null,
        renderHTML: (attrs) => {
          if (!attrs.verticalAlign) return {};
          return {
            "data-valign": attrs.verticalAlign,
            style: `vertical-align: ${attrs.verticalAlign}`,
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
      verticalAlign: {
        default: null,
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute("data-valign") ||
          (el as HTMLElement).style.verticalAlign ||
          null,
        renderHTML: (attrs) => {
          if (!attrs.verticalAlign) return {};
          return {
            "data-valign": attrs.verticalAlign,
            style: `vertical-align: ${attrs.verticalAlign}`,
          };
        },
      },
    };
  },
});

// Table com largura customizável (width em % ou px)
const ResizableTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute("data-width") || (el as HTMLElement).style.width || null,
        renderHTML: (attrs) => {
          if (!attrs.width) return {};
          return {
            "data-width": attrs.width,
            style: `width: ${attrs.width}`,
          };
        },
      },
    };
  },
});

// TableRow com altura customizável
const ResizableTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      height: {
        default: null,
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute("data-height") ||
          (el as HTMLElement).style.height ||
          null,
        renderHTML: (attrs) => {
          if (!attrs.height) return {};
          return {
            "data-height": attrs.height,
            style: `height: ${attrs.height}`,
          };
        },
      },
    };
  },
});

const FONTS = [
  "Arial",
  "Calibri",
  "Times New Roman",
  "Georgia",
  "Verdana",
  "Tahoma",
  "Courier New",
  "Helvetica",
  "Garamond",
  "Trebuchet MS",
];
const SIZES = [
  "5px",
  "6px",
  "7px",
  "8px",
  "9px",
  "10px",
  "12px",
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
  "28px",
  "32px",
  "40px",
];

// NodeView React para imagem: contorno quando selecionada + handle para redimensionar.
function ImageNodeView(props: NodeViewProps) {
  const { node, updateAttributes, selected, editor, getPos } = props;
  const width = (node.attrs.width as string) || "";
  const align = (node.attrs.align as string) || "none";
  const free = Boolean(node.attrs.free);
  const posX = Number(node.attrs.posX ?? 0);
  const posY = Number(node.attrs.posY ?? 0);

  const startResize = (corner: "nw" | "ne" | "sw" | "se") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const wrap = (e.currentTarget as HTMLElement).parentElement;
    const img = wrap?.querySelector("img") as HTMLImageElement | null;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const startX = e.clientX;
    const startWidth = rect.width;
    const startHeight = rect.height || 1;
    const ratio = startWidth / startHeight;
    const dirX = corner === "ne" || corner === "se" ? 1 : -1;
    const keepRatio = !e.altKey; // Alt libera proporção (igual Word ~ Shift, mas usamos Alt)
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) * dirX;
      const next = Math.max(40, Math.round(startWidth + dx));
      updateAttributes({ width: `${next}px` });
      // height segue via CSS height:auto + ratio mantido naturalmente pelo img
      void keepRatio;
      void ratio;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Arrastar livremente a imagem dentro da página (quando free=true)
  const startDrag = (e: React.PointerEvent) => {
    if (!free || !editor.isEditable) return;
    e.preventDefault();
    e.stopPropagation();
    const wrap = e.currentTarget as HTMLElement;
    const page = wrap.closest(".rt-page") as HTMLElement | null;
    if (!page) return;
    const pageRect = page.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const offsetX = e.clientX - wrapRect.left;
    const offsetY = e.clientY - wrapRect.top;
    if (typeof getPos === "function") {
      const pos = getPos();
      if (typeof pos === "number") {
        editor.chain().focus().setNodeSelection(pos).run();
      }
    }
    const move = (ev: PointerEvent) => {
      const x = ev.clientX - pageRect.left - offsetX;
      const y = ev.clientY - pageRect.top - offsetY;
      updateAttributes({ posX: Math.round(x), posY: Math.round(y) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const alignClass =
    align === "center"
      ? "rt-img-block-center"
      : align === "left"
        ? "rt-img-block-left"
        : align === "right"
          ? "rt-img-block-right"
          : "";

  const freeStyle: React.CSSProperties | undefined = free
    ? { position: "absolute", left: posX, top: posY, zIndex: 5, cursor: "move" }
    : undefined;

  return (
    <NodeViewWrapper
      as="span"
      className={`rt-img-wrap ${free ? "is-free" : alignClass} ${selected ? "is-selected" : ""}`}
      data-drag-handle
      style={freeStyle}
      onPointerDown={free ? startDrag : undefined}
    >
      <img
        src={node.attrs.src}
        alt={node.attrs.alt || ""}
        title={node.attrs.title || ""}
        style={width ? { width } : undefined}
        draggable={false}
        onMouseDown={(e) => {
          if (free) return; // dragging handled by wrapper
          // Garante que clicar na imagem cria uma NodeSelection,
          // para que editor.isActive("image") fique true e a toolbar
          // de imagem (alinhar/cortar/largura) habilite.
          if (typeof getPos === "function") {
            const pos = getPos();
            if (typeof pos === "number") {
              e.preventDefault();
              editor.chain().focus().setNodeSelection(pos).run();
            }
          }
        }}
      />
      {selected && editor.isEditable && (
        <>
          <span
            className="rt-img-handle rt-img-handle-nw"
            onPointerDown={startResize("nw")}
            title="Redimensionar"
          />
          <span
            className="rt-img-handle rt-img-handle-ne"
            onPointerDown={startResize("ne")}
            title="Redimensionar"
          />
          <span
            className="rt-img-handle rt-img-handle-sw"
            onPointerDown={startResize("sw")}
            title="Redimensionar"
          />
          <span
            className="rt-img-handle rt-img-handle-se"
            onPointerDown={startResize("se")}
            title="Redimensionar"
          />
        </>
      )}
    </NodeViewWrapper>
  );
}

// Estende Image para suportar width + align persistidos no HTML.
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const html = el as HTMLElement;
          const w = html.style.width || html.getAttribute("width");
          return w || null;
        },
        renderHTML: (attrs) => {
          if (!attrs.width) return {};
          return { style: `width: ${attrs.width}` };
        },
      },
      align: {
        default: "none",
        parseHTML: (el) => {
          const cls = (el as HTMLElement).className || "";
          if (cls.includes("rt-img-center")) return "center";
          if (cls.includes("rt-img-left")) return "left";
          if (cls.includes("rt-img-right")) return "right";
          return "none";
        },
        renderHTML: (attrs) => {
          if (!attrs.align || attrs.align === "none") return {};
          return { class: `rt-img-${attrs.align}` };
        },
      },
      free: {
        default: false,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-free") === "1",
        renderHTML: (attrs) => (attrs.free ? { "data-free": "1" } : {}),
      },
      posX: {
        default: 0,
        parseHTML: (el) => Number((el as HTMLElement).getAttribute("data-x") || 0),
        renderHTML: (attrs) => (attrs.free ? { "data-x": String(attrs.posX ?? 0) } : {}),
      },
      posY: {
        default: 0,
        parseHTML: (el) => Number((el as HTMLElement).getAttribute("data-y") || 0),
        renderHTML: (attrs) => (attrs.free ? { "data-y": String(attrs.posY ?? 0) } : {}),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});

function ToolbarButton({
  active,
  onClick,
  title,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
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
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string>("");
  const [cropTargetPos, setCropTargetPos] = useState<number | null>(null);
  const [selectionVersion, setSelectionVersion] = useState(0);
  // Margens da página em mm (A4: 210 × 297). Persistidas em localStorage por clínica.
  const storageKey = `rt-margins:${clinicaId || "default"}`;
  const readStored = () => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw
        ? (JSON.parse(raw) as { t: number; b: number; l: number; r: number; s: boolean })
        : null;
    } catch {
      return null;
    }
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
        JSON.stringify({
          t: marginTop,
          b: marginBottom,
          l: marginLeft,
          r: marginRight,
          s: showRuler,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [storageKey, marginTop, marginBottom, marginLeft, marginRight, showRuler]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      FontFamily.configure({ types: ["textStyle"] }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      ResizableTable.configure({ resizable: true, HTMLAttributes: { class: "rt-table" } }),
      ResizableTableRow,
      ColoredTableHeader,
      ColoredTableCell,
      ResizableImage.configure({ inline: true, allowBase64: true }),
    ],
    content: value || "<p></p>",
    editorProps: {
      attributes: {
        class: "rt-editor prose prose-sm max-w-none focus:outline-none min-h-[60vh]",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Sync external value updates (when switching convênios)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    if (!editor) return;
    const refreshSelection = () => setSelectionVersion((version) => version + 1);
    editor.on("selectionUpdate", refreshSelection);
    editor.on("transaction", refreshSelection);
    return () => {
      editor.off("selectionUpdate", refreshSelection);
      editor.off("transaction", refreshSelection);
    };
  }, [editor]);

  if (!editor) return null;

  const getSelectedImageTarget = () => {
    const { selection } = editor.state;
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== "image") return null;
    const src = selection.node.attrs.src as string | undefined;
    return src ? { src, pos: selection.from } : null;
  };

  // Helpers para encontrar a tabela/linha atuais e atualizar atributos (largura/altura)
  const findAncestorPos = (
    typeName: string,
  ): { pos: number; attrs: Record<string, unknown> } | null => {
    const { $from } = editor.state.selection;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name === typeName) {
        return { pos: $from.before(d), attrs: node.attrs };
      }
    }
    return null;
  };
  const updateAncestor = (typeName: string, patch: Record<string, unknown>) => {
    const found = findAncestorPos(typeName);
    if (!found) return;
    editor
      .chain()
      .focus()
      .command(({ tr, dispatch, state }) => {
        const node = state.doc.nodeAt(found.pos);
        if (!node) return false;
        dispatch?.(tr.setNodeMarkup(found.pos, undefined, { ...node.attrs, ...patch }));
        return true;
      })
      .run();
  };
  const tableNode = findAncestorPos("table");
  const rowNode = findAncestorPos("tableRow");
  const currentTableWidth = (tableNode?.attrs.width as string | null) || "";
  const currentRowHeight = (rowNode?.attrs.height as string | null) || "";

  const replaceCropTarget = (dataUrl: string) => {
    if (cropTargetPos === null) {
      editor.chain().focus().updateAttributes("image", { src: dataUrl }).run();
      return;
    }
    editor
      .chain()
      .focus()
      .command(({ state, tr, dispatch }) => {
        const node = state.doc.nodeAt(cropTargetPos);
        if (!node || node.type.name !== "image") return false;
        dispatch?.(tr.setNodeMarkup(cropTargetPos, undefined, { ...node.attrs, src: dataUrl }));
        return true;
      })
      .run();
  };

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
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      mostrarErro(error);
      return;
    }
    const { data } = supabase.storage.from("cb-informativos").getPublicUrl(path);
    editor.chain().focus().setImage({ src: data.publicUrl }).run();
  };

  const handleUploadMany = async (files: File[]) => {
    for (const f of files) {
      // sequencial para preservar ordem de inserção (ficam lado a lado)

      await handleUpload(f);
    }
  };

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL do link:", prev || "https://");
    if (url === null) return;
    if (url === "") {
      (editor.chain().focus() as any).unsetLink?.().run();
      return;
    }
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
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="Fonte" />
          </SelectTrigger>
          <SelectContent>
            {FONTS.map((f) => (
              <SelectItem key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={(editor.getAttributes("textStyle").fontSize as string) || ""}
          onValueChange={(v) => {
            // FontSize isn't built-in; emulate via inline style mark
            (editor.chain().focus() as any).setMark("textStyle", { fontSize: v }).run();
          }}
        >
          <SelectTrigger className="h-8 w-[90px] text-xs">
            <SelectValue placeholder="Tam." />
          </SelectTrigger>
          <SelectContent>
            {SIZES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="w-px h-6 bg-border mx-1" />
        <ToolbarButton
          title="Negrito"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Itálico"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Sublinhado"
          active={editor.isActive("underline")}
          onClick={() => (editor.chain().focus() as any).toggleUnderline?.().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Tachado"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
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
        <ToolbarButton
          title="Alinhar à esquerda"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Centralizar"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Alinhar à direita"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Justificar"
          active={editor.isActive({ textAlign: "justify" })}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        >
          <AlignJustify className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />
        <ToolbarButton
          title="Título 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Título 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Título 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Lista"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Lista numerada"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />
        <ToolbarButton
          title="Inserir tabela 3×3"
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          <TableIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Adicionar linha"
          onClick={() => editor.chain().focus().addRowAfter().run()}
          disabled={!editor.can().addRowAfter()}
        >
          <Rows3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Adicionar coluna"
          onClick={() => editor.chain().focus().addColumnAfter().run()}
          disabled={!editor.can().addColumnAfter()}
        >
          <Columns3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Excluir linha"
          onClick={() => editor.chain().focus().deleteRow().run()}
          disabled={!editor.can().deleteRow()}
        >
          <span className="text-[10px] font-bold">−L</span>
        </ToolbarButton>
        <ToolbarButton
          title="Excluir coluna"
          onClick={() => editor.chain().focus().deleteColumn().run()}
          disabled={!editor.can().deleteColumn()}
        >
          <span className="text-[10px] font-bold">−C</span>
        </ToolbarButton>
        <ToolbarButton
          title="Excluir tabela"
          onClick={() => editor.chain().focus().deleteTable().run()}
          disabled={!editor.can().deleteTable()}
        >
          <Trash2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Mesclar células selecionadas"
          onClick={() => editor.chain().focus().mergeCells().run()}
          disabled={!editor.can().mergeCells()}
        >
          <span className="text-[10px] font-bold">⊞→▭</span>
        </ToolbarButton>
        <ToolbarButton
          title="Desmesclar célula"
          onClick={() => editor.chain().focus().splitCell().run()}
          disabled={!editor.can().splitCell()}
        >
          <span className="text-[10px] font-bold">▭→⊞</span>
        </ToolbarButton>
        <ToolbarButton
          title="Centralizar conteúdo da célula (horizontal + vertical)"
          onClick={() => {
            editor
              .chain()
              .focus()
              .setCellAttribute("verticalAlign", "middle")
              .setTextAlign("center")
              .run();
          }}
          disabled={!editor.can().setCellAttribute("verticalAlign", "middle")}
        >
          <span className="text-[10px] font-bold">⊕</span>
        </ToolbarButton>
        <ToolbarButton
          title="Alinhar célula ao topo"
          onClick={() => editor.chain().focus().setCellAttribute("verticalAlign", "top").run()}
          disabled={!editor.can().setCellAttribute("verticalAlign", "top")}
        >
          <span className="text-[10px] font-bold">⤒</span>
        </ToolbarButton>
        <ToolbarButton
          title="Alinhar célula ao meio (vertical)"
          onClick={() => editor.chain().focus().setCellAttribute("verticalAlign", "middle").run()}
          disabled={!editor.can().setCellAttribute("verticalAlign", "middle")}
        >
          <span className="text-[10px] font-bold">↕</span>
        </ToolbarButton>
        <ToolbarButton
          title="Alinhar célula à base"
          onClick={() => editor.chain().focus().setCellAttribute("verticalAlign", "bottom").run()}
          disabled={!editor.can().setCellAttribute("verticalAlign", "bottom")}
        >
          <span className="text-[10px] font-bold">⤓</span>
        </ToolbarButton>
        <label
          className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-muted cursor-pointer relative"
          title="Cor de fundo da célula (selecione células para pintar linha/coluna)"
        >
          <TableIcon className="h-4 w-4" />
          <span
            className="absolute bottom-1 left-1.5 right-1.5 h-1 rounded-sm border border-border"
            style={{
              background:
                (editor.getAttributes("tableCell").backgroundColor as string) ||
                (editor.getAttributes("tableHeader").backgroundColor as string) ||
                "#ffffff",
            }}
          />
          <input
            type="color"
            className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
            disabled={!editor.can().setCellAttribute("backgroundColor", "#ffffff")}
            onChange={(e) =>
              editor.chain().focus().setCellAttribute("backgroundColor", e.target.value).run()
            }
          />
        </label>
        <ToolbarButton
          title="Remover cor da célula"
          onClick={() => editor.chain().focus().setCellAttribute("backgroundColor", null).run()}
          disabled={!editor.can().setCellAttribute("backgroundColor", null)}
        >
          <span className="text-[10px] font-bold">⌫</span>
        </ToolbarButton>

        {/* Largura da tabela */}
        <Select
          value={currentTableWidth || "auto"}
          onValueChange={(v) => updateAncestor("table", { width: v === "auto" ? null : v })}
        >
          <SelectTrigger
            className="h-8 w-[110px] text-xs"
            title="Largura da tabela"
            disabled={!tableNode}
          >
            <SelectValue placeholder="Larg. tabela" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="100%">100%</SelectItem>
            <SelectItem value="75%">75%</SelectItem>
            <SelectItem value="50%">50%</SelectItem>
            <SelectItem value="25%">25%</SelectItem>
          </SelectContent>
        </Select>
        {/* Altura da linha */}
        <input
          type="text"
          inputMode="numeric"
          placeholder="Alt. linha (px)"
          className="h-8 w-[110px] rounded border border-input bg-background px-2 text-xs disabled:opacity-50"
          title="Altura da linha em px (vazio = automático)"
          disabled={!rowNode}
          value={currentRowHeight.replace(/px$/, "")}
          onChange={(e) => {
            const v = e.target.value.trim();
            updateAncestor("tableRow", { height: v ? `${parseInt(v, 10) || 0}px` : null });
          }}
        />

        <div className="w-px h-6 bg-border mx-1" />
        <ToolbarButton title="Inserir imagem" onClick={() => fileRef.current?.click()}>
          <ImageIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Excluir imagem selecionada"
          disabled={!getSelectedImageTarget()}
          onClick={() => {
            if (getSelectedImageTarget()) {
              editor.chain().focus().deleteSelection().run();
            } else {
              toast.info("Clique na imagem que deseja excluir e tente novamente.");
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Link" active={editor.isActive("link")} onClick={setLink}>
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        {(() => {
          void selectionVersion;
          const imgTarget = getSelectedImageTarget();
          const imgActive = Boolean(imgTarget);
          return (
            <>
              <div className="w-px h-6 bg-border mx-1" />
              <ToolbarButton
                title="Alinhar imagem à esquerda"
                active={imgActive && editor.getAttributes("image").align === "left"}
                disabled={!imgActive}
                onClick={() =>
                  editor.chain().focus().updateAttributes("image", { align: "left" }).run()
                }
              >
                <AlignLeft className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                title="Centralizar imagem"
                active={imgActive && editor.getAttributes("image").align === "center"}
                disabled={!imgActive}
                onClick={() =>
                  editor.chain().focus().updateAttributes("image", { align: "center" }).run()
                }
              >
                <AlignCenter className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                title="Alinhar imagem à direita"
                active={imgActive && editor.getAttributes("image").align === "right"}
                disabled={!imgActive}
                onClick={() =>
                  editor.chain().focus().updateAttributes("image", { align: "right" }).run()
                }
              >
                <AlignRight className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                title="Cortar imagem"
                disabled={!imgActive}
                onClick={() => {
                  const target = imgTarget ?? getSelectedImageTarget();
                  if (!target) {
                    toast.info("Clique na imagem que deseja cortar e tente novamente.");
                    return;
                  }
                  setCropTargetPos(target.pos);
                  setCropSrc(target.src);
                  setCropOpen(true);
                }}
              >
                <Crop className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                title="Posição livre (arrastar imagem)"
                active={imgActive && Boolean(editor.getAttributes("image").free)}
                disabled={!imgActive}
                onClick={() => {
                  const isFree = Boolean(editor.getAttributes("image").free);
                  editor
                    .chain()
                    .focus()
                    .updateAttributes("image", {
                      free: !isFree,
                      posX: isFree ? 0 : (editor.getAttributes("image").posX ?? 40),
                      posY: isFree ? 0 : (editor.getAttributes("image").posY ?? 40),
                    })
                    .run();
                }}
              >
                <span className="text-[10px] font-bold">✥</span>
              </ToolbarButton>
              <Select
                value=""
                disabled={!imgActive}
                onValueChange={(v) => {
                  editor
                    .chain()
                    .focus()
                    .updateAttributes("image", {
                      width: v === "auto" ? null : v,
                    })
                    .run();
                }}
              >
                <SelectTrigger
                  className="h-8 w-[110px] text-xs"
                  title="Largura da imagem"
                  disabled={!imgActive}
                >
                  <SelectValue
                    placeholder={(editor.getAttributes("image").width as string) || "Largura"}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25%">25%</SelectItem>
                  <SelectItem value="50%">50%</SelectItem>
                  <SelectItem value="75%">75%</SelectItem>
                  <SelectItem value="100%">100%</SelectItem>
                  <SelectItem value="auto">Tamanho original</SelectItem>
                </SelectContent>
              </Select>
            </>
          );
        })()}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            if (files.length) handleUploadMany(files);
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
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
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
              onChangeLeft={(v) =>
                setMarginLeft(Math.max(0, Math.min(pageWidthMm - marginRight - 20, v)))
              }
              onChangeRight={(v) =>
                setMarginRight(Math.max(0, Math.min(pageWidthMm - marginLeft - 20, v)))
              }
            />
          )}
          <div
            className="rt-page bg-white shadow-md"
            style={{
              width: "210mm",
              minHeight: "297mm",
              position: "relative",
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
          onClick={() => {
            setMarginTop(12);
            setMarginBottom(12);
            setMarginLeft(14);
            setMarginRight(14);
          }}
          className="px-2 py-1 rounded hover:bg-muted ml-auto"
        >
          Restaurar padrão
        </button>
      </div>
      <ImageCropDialog
        open={cropOpen}
        src={cropSrc}
        onClose={() => setCropOpen(false)}
        onCropped={(dataUrl) => {
          // Substitui o src da imagem selecionada pelo recorte (data URL PNG).
          replaceCropTarget(dataUrl);
        }}
      />
    </div>
  );
}

function MarginInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
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
  widthMm,
  marginLeft,
  marginRight,
  onChangeLeft,
  onChangeRight,
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
        const pct = ((cm * 10) / widthMm) * 100;
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
            <span
              className={`w-px flex-1 mt-0.5 ${inMargin ? "bg-background/60" : "bg-muted-foreground/50"}`}
            />
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
