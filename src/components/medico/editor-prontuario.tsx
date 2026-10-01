/**
 * Editor de prontuário com texto rico (fila do médico e Baixa).
 * Grava HTML; veja `src/lib/prontuario/html.ts` para a convivência com texto puro.
 */
import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color, FontFamily, FontSize } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Superscript as SupIcon,
  Subscript as SubIcon,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Table as TableIcon,
  Undo2,
  Redo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { htmlDoProntuario } from "@/lib/prontuario/html";

const FONTES = ["Arial", "Times New Roman", "Courier New", "Verdana", "Georgia"];
const TAMANHOS = ["10px", "12px", "14px", "16px", "18px", "24px"];

export function EditorProntuario({
  value,
  onChange,
  disabled,
  minHeight = 180,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  minHeight?: number;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Subscript,
      Superscript,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: htmlDoProntuario(value),
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  });

  // Troca de paciente: recarrega o conteúdo vindo de fora.
  useEffect(() => {
    if (!editor) return;
    const atual = editor.isEmpty ? "" : editor.getHTML();
    const novo = htmlDoProntuario(value);
    if (novo !== atual) editor.commands.setContent(novo, { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) return <div className="rounded-md border" style={{ minHeight }} />;

  const B = ({
    on,
    ativo,
    titulo,
    children,
  }: {
    on: () => void;
    ativo?: boolean;
    titulo: string;
    children: React.ReactNode;
  }) => (
    <Button
      type="button"
      size="icon"
      variant={ativo ? "secondary" : "ghost"}
      className="h-7 w-7"
      onClick={on}
      title={titulo}
      aria-label={titulo}
      disabled={disabled}
    >
      {children}
    </Button>
  );
  const c = () => editor.chain().focus();

  return (
    <div className="rounded-md border bg-background">
      <div className="flex flex-wrap items-center gap-0.5 border-b p-1">
        <B titulo="Negrito" ativo={editor.isActive("bold")} on={() => c().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </B>
        <B titulo="Itálico" ativo={editor.isActive("italic")} on={() => c().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </B>
        <B
          titulo="Sublinhado"
          ativo={editor.isActive("underline")}
          on={() => c().toggleUnderline().run()}
        >
          <Underline className="h-3.5 w-3.5" />
        </B>
        <B titulo="Tachado" ativo={editor.isActive("strike")} on={() => c().toggleStrike().run()}>
          <Strikethrough className="h-3.5 w-3.5" />
        </B>
        <B
          titulo="Sobrescrito"
          ativo={editor.isActive("superscript")}
          on={() => c().toggleSuperscript().run()}
        >
          <SupIcon className="h-3.5 w-3.5" />
        </B>
        <B
          titulo="Subscrito"
          ativo={editor.isActive("subscript")}
          on={() => c().toggleSubscript().run()}
        >
          <SubIcon className="h-3.5 w-3.5" />
        </B>
        <select
          className="h-7 rounded border bg-background px-1 text-xs"
          aria-label="Fonte"
          disabled={disabled}
          defaultValue=""
          onChange={(e) =>
            e.target.value ? c().setFontFamily(e.target.value).run() : c().unsetFontFamily().run()
          }
        >
          <option value="">Fonte</option>
          {FONTES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select
          className="h-7 rounded border bg-background px-1 text-xs"
          aria-label="Tamanho"
          disabled={disabled}
          defaultValue=""
          onChange={(e) =>
            e.target.value ? c().setFontSize(e.target.value).run() : c().unsetFontSize().run()
          }
        >
          <option value="">Tamanho</option>
          {TAMANHOS.map((t) => (
            <option key={t} value={t}>
              {t.replace("px", "")}
            </option>
          ))}
        </select>
        <input
          type="color"
          className="h-7 w-7 cursor-pointer rounded border bg-background p-0.5"
          aria-label="Cor do texto"
          title="Cor do texto"
          disabled={disabled}
          onChange={(e) => c().setColor(e.target.value).run()}
        />
        <B
          titulo="Lista"
          ativo={editor.isActive("bulletList")}
          on={() => c().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </B>
        <B
          titulo="Lista numerada"
          ativo={editor.isActive("orderedList")}
          on={() => c().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </B>
        <B titulo="Alinhar à esquerda" on={() => c().setTextAlign("left").run()}>
          <AlignLeft className="h-3.5 w-3.5" />
        </B>
        <B titulo="Centralizar" on={() => c().setTextAlign("center").run()}>
          <AlignCenter className="h-3.5 w-3.5" />
        </B>
        <B titulo="Alinhar à direita" on={() => c().setTextAlign("right").run()}>
          <AlignRight className="h-3.5 w-3.5" />
        </B>
        <B titulo="Justificar" on={() => c().setTextAlign("justify").run()}>
          <AlignJustify className="h-3.5 w-3.5" />
        </B>
        <B
          titulo="Inserir tabela"
          on={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableIcon className="h-3.5 w-3.5" />
        </B>
        <B titulo="Desfazer" on={() => c().undo().run()}>
          <Undo2 className="h-3.5 w-3.5" />
        </B>
        <B titulo="Refazer" on={() => c().redo().run()}>
          <Redo2 className="h-3.5 w-3.5" />
        </B>
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-3 dark:prose-invert [&_.ProseMirror]:outline-none [&_table]:border [&_td]:border [&_td]:p-1 [&_th]:border [&_th]:p-1"
        style={{ minHeight }}
      />
    </div>
  );
}
