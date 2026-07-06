import * as React from "react";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * HhpWizardShell — Shell para wizards de N etapas no padrão Health Hub Pro.
 * Cuida do dialog responsivo, progress bar por passos e footer sticky.
 * Não define regra de negócio — só a moldura visual.
 */
export interface HhpWizardShellProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  stepLabel: string;
  stepIndex: number;
  stepsCount: number;
  heading: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
  maxWidth?: string;
}

export function HhpWizardShell({
  open, onOpenChange, title, description,
  stepLabel, stepIndex, stepsCount,
  heading, children, footer, maxWidth = "720px",
}: HhpWizardShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-3xl border-slate-200 bg-white"
        style={{ maxWidth }}
      >
        <VisuallyHidden.Root>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </VisuallyHidden.Root>

        <div className="px-5 md:px-8 pt-6 md:pt-8 pb-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-indigo-500">
            {stepLabel}
          </div>
          <h2
            className="mt-1 text-xl md:text-2xl font-semibold text-slate-900"
            style={{ fontFamily: "'Inter Tight', Inter, sans-serif", letterSpacing: "-0.01em" }}
          >
            {heading}
          </h2>
          <div className="mt-5 flex items-center gap-1.5">
            {Array.from({ length: stepsCount }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  i <= stepIndex ? "bg-indigo-500" : "bg-slate-100",
                )}
              />
            ))}
          </div>
        </div>

        <div className="px-5 md:px-8 py-6 min-h-[320px] md:min-h-[380px]">
          {children}
        </div>

        <div className="px-5 md:px-8 py-4 md:py-5 border-t border-slate-100 flex items-center justify-between bg-slate-50/40">
          {footer}
        </div>
      </DialogContent>
    </Dialog>
  );
}