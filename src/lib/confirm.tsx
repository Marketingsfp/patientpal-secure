import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, HelpCircle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConfirmTone = "default" | "danger" | "warning";

export type ConfirmOptions = {
  title?: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
};

type Pending = ConfirmOptions & { resolve: (v: boolean) => void };

let emit: ((p: Pending) => void) | null = null;

/**
 * Modal de confirmação global (substitui window.confirm em todo o sistema).
 * Uso: `if (!(await confirmDialog("Excluir item?"))) return;`
 */
export function confirmDialog(
  input: string | ConfirmOptions,
  extra?: ConfirmOptions,
): Promise<boolean> {
  const opts: ConfirmOptions =
    typeof input === "string" ? { description: input, ...(extra ?? {}) } : input;
  if (!emit) {
    // Sem host montado (SSR ou fora da árvore React): não bloqueia o fluxo.
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => emit!({ ...opts, resolve }));
}

export function ConfirmDialogHost() {
  const [pending, setPending] = React.useState<Pending | null>(null);

  React.useEffect(() => {
    emit = (p) => setPending(p);
    return () => {
      emit = null;
    };
  }, []);

  const close = React.useCallback(
    (value: boolean) => {
      setPending((cur) => {
        cur?.resolve(value);
        return null;
      });
    },
    [],
  );

  const tone = pending?.tone ?? "default";
  const Icon = tone === "danger" ? Trash2 : tone === "warning" ? AlertTriangle : HelpCircle;

  return (
    <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) close(false); }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                tone === "danger"
                  ? "bg-destructive/10 text-destructive"
                  : tone === "warning"
                    ? "bg-amber-500/10 text-amber-600"
                    : "bg-primary/10 text-primary",
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1.5 text-left">
              <AlertDialogTitle className="text-base">
                {pending?.title ?? "Confirmar ação"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="whitespace-pre-line text-sm text-muted-foreground">
                  {pending?.description}
                </div>
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>
            {pending?.cancelText ?? "Cancelar"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={cn(
              tone === "danger" &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {pending?.confirmText ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
