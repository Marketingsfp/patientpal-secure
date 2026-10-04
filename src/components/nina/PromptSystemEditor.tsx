import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type PromptSystemEditorProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
};

const textClassName =
  "min-w-0 overflow-x-hidden overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-sm leading-relaxed";

export function PromptSystemEditor({
  id,
  label,
  value,
  onChange,
  readOnly,
}: PromptSystemEditorProps) {
  return (
    <Dialog>
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-sm font-medium" htmlFor={id}>
            {label}
          </label>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Maximize2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Expandir editor
            </Button>
          </DialogTrigger>
        </div>
        <Textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          readOnly={readOnly}
          spellCheck={false}
          wrap="soft"
          className={`${textClassName} min-h-[520px] resize-y`}
        />
      </div>
      <DialogContent
        className="flex h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-3 overflow-hidden p-3 sm:p-4"
        onEscapeKeyDown={() => {
          /* Fechar mantém o texto no editor da página. */
        }}
      >
        <DialogHeader className="shrink-0 pr-8 text-left">
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {readOnly
              ? "Somente leitura. O texto se ajusta à largura da tela."
              : "Ao voltar, suas alterações continuam no editor. Salve o rascunho na página para guardá-las."}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          id={`${id}-ampliado`}
          aria-label={`${label} — tela ampliada`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          readOnly={readOnly}
          spellCheck={false}
          wrap="soft"
          className={`${textClassName} h-full min-h-0 flex-1 resize-none`}
        />
        <DialogFooter className="shrink-0">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Voltar à página
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
