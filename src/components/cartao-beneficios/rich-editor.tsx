import { useEffect, useRef } from "react";
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
}

export function RichEditor({ value, onChange, clinicaId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      FontFamily.configure({ types: ["textStyle"] }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true, HTMLAttributes: { class: "rt-table" } }),
      TableRow, TableHeader, TableCell,
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content: value || "<p></p>",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[60vh] [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-black [&_th]:p-1 [&_td]:border [&_td]:border-black [&_td]:p-1",
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
    <div className="border rounded-md overflow-hidden bg-background">
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
        <Button
          type="button" variant="ghost" size="sm" className="h-8"
          onClick={() => editor.commands.setContent("<p></p>")}
        >
          Limpar
        </Button>
      </div>

      <div className="bg-muted/40 overflow-auto" style={{ maxHeight: "70vh" }}>
        <div className="mx-auto my-4 bg-white shadow-md" style={{ width: "210mm", minHeight: "297mm", padding: "12mm 14mm" }}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}