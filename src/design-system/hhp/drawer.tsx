import * as React from "react";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";

/**
 * HhpDrawer — Drawer lateral padrão do Health Hub Pro.
 * Wrapper do Sheet com defaults do padrão: largura responsiva, título
 * acessível oculto por padrão, transições no ritmo HHP.
 *
 * Uso: "Centro de Atendimento" (paciente), "Detalhe do lançamento"
 * (Financeiro), "Detalhe do lead" (CRM), etc.
 */
export interface HhpDrawerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  hiddenTitle?: boolean;
  side?: "left" | "right";
  maxWidth?: string;
  children: React.ReactNode;
}

export function HhpDrawer({
  open, onOpenChange, title, description, hiddenTitle = true,
  side = "right", maxWidth = "520px", children,
}: HhpDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className="w-full overflow-y-auto p-0 bg-white transition-transform duration-150"
        style={{ maxWidth: `min(100vw, ${maxWidth})` }}
      >
        {hiddenTitle ? (
          <VisuallyHidden.Root>
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </VisuallyHidden.Root>
        ) : (
          <div className="px-6 pt-6 pb-2">
            <SheetTitle className="text-base font-semibold tracking-tight text-slate-900">{title}</SheetTitle>
            {description && (
              <SheetDescription className="text-xs text-slate-500 mt-1">{description}</SheetDescription>
            )}
          </div>
        )}
        {children}
      </SheetContent>
    </Sheet>
  );
}